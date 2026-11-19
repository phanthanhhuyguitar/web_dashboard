# Chay thay nut "Xuat file" tren giao dien "Lich su doi soat" - KHONG can cai gi them (khong can
# Node.js, khong can npm install) - chi dung PowerShell co san tren Windows de goi thang API TNEX
# that (Invoke-RestMethod) va xuat file Excel. Dung cho may khong duoc phep cai dat gi, chi chay
# duoc cmd/PowerShell co san.
#
# Luong chay:
#   1. Dang nhap bang so dien thoai + mat khau + OTP (giong form dang nhap tren web) de lay token.
#   2. Nhap thang/nam can xuat (+ loc theo ma sale / trang thai, tuy chon).
#   3. Tai toan bo lich su doi soat (search-history) + tra cuu STK/CCCD/trang thai ky HD tung CTV
#      (search-users -> users/profile) - dung logic giong het nut "Xuat file" tren web.
#   4. Xuat ra file Excel that (.xlsx) qua COM cua Microsoft Excel neu may co cai Excel; neu khong
#      co Excel thi tu dong xuat ra file .csv (van mo duoc truc tiep bang Excel khi click doi).
#
# Cach chay: mo PowerShell tai thu muc nay roi go ".\xuat-doi-soat.ps1", hoac bam chuot phai vao
# file nay -> "Run with PowerShell".

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ===== Cau hinh API (giong het src/config/env.js cua web) =====
$BaseUrl = 'https://api-gw-ds.tnex.com.vn'
$LoginEndpoint = '/digital-sale/api/v1/users/admin-login'
$HistoryEndpoint = '/digital-sale-admin/api/v1/admin/reconciliations/search-history'
$SearchUsersEndpoint = '/digital-sale-admin/api/v1/admin/search-users'
$UserDetailEndpoint = '/digital-sale-admin/api/v1/admin/users/profile'

$ExportPageSize = 50
$MaxPages = 100
$SaleIdLookupPageSize = 50
$SaleIdLookupMaxPages = 5
$EnrichDelayMs = 150
# ================================================================

function Get-PropValue {
    param($Object, [string[]]$Paths)

    foreach ($path in $Paths) {
        $current = $Object
        $ok = $true

        foreach ($part in ($path -split '\.')) {
            if ($null -eq $current) { $ok = $false; break }
            $prop = $current.PSObject.Properties[$part]
            if ($null -eq $prop) { $ok = $false; break }
            $current = $prop.Value
        }

        if ($ok -and $null -ne $current -and $current -ne '') { return $current }
    }

    return $null
}

function Invoke-TnexApi {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Body = $null,
        [hashtable]$Query = $null,
        [string]$Token = $null
    )

    $uri = $BaseUrl + $Path

    if ($Query) {
        $pairs = @()
        foreach ($key in $Query.Keys) {
            $pairs += ('{0}={1}' -f [uri]::EscapeDataString($key), [uri]::EscapeDataString([string]$Query[$key]))
        }
        if ($pairs.Count -gt 0) { $uri = $uri + '?' + ($pairs -join '&') }
    }

    $headers = @{ 'Accept' = 'application/json' }
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }

    $invokeParams = @{ Uri = $uri; Method = $Method; Headers = $headers }

    if ($Body) {
        $invokeParams['Body'] = ($Body | ConvertTo-Json -Depth 10)
        $invokeParams['ContentType'] = 'application/json'
    }

    try {
        return Invoke-RestMethod @invokeParams
    } catch {
        $message = $_.Exception.Message
        if ($_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $bodyText = $reader.ReadToEnd()
                if ($bodyText) { $message = $bodyText }
            } catch {}
        }
        throw "Loi goi $Path : $message"
    }
}

function Format-ReportMonthLabel {
    param([string]$Value)

    if ($Value -match '^(\d{4})-(\d{2})') { return "Tháng $([int]$Matches[2])/$($Matches[1])" }
    return $Value
}

function Format-DateTimeLabel {
    param($Value)

    if (-not $Value) { return '--' }
    try { return ([datetime]$Value).ToString('yyyy/MM/dd HH:mm:ss') } catch { return '--' }
}

$StatusLabels = @{
    'FILE_CREATED'       = 'Đã tạo'
    'PAYMENT_CONFIRMED'  = 'Đã xác nhận'
    'UPDATED_SUCCESS'    = 'Đã cập nhật'
    'AUTO_CONFIRMED'     = 'Tự động xác nhận'
}
$ContractLabels = @{
    'SIGNED'        = 'Đã ký'
    'PENDING'       = 'Chờ ký'
    'NOT_SIGNED'    = 'Chưa ký'
    'LOOKUP_FAILED' = 'Không tra được'
}

# ===== Buoc 1: Dang nhap =====
Write-Host '=== Xuat file doi soat (chay thay giao dien - khong can cai gi them) ===' -ForegroundColor Cyan
Write-Host ''
Write-Host '--- Dang nhap TNEX Partner ---' -ForegroundColor Cyan

$phone = Read-Host 'So dien thoai dang nhap'
$securePassword = Read-Host 'Mat khau' -AsSecureString
$passwordPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($securePassword)
try {
    $password = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($passwordPtr)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($passwordPtr)
}
$totp = Read-Host 'Ma OTP/TOTP (de trong neu tai khoan khong bat 2FA)'

Write-Host 'Dang dang nhap...' -ForegroundColor Yellow

$token = $null
try {
    $loginResponse = Invoke-TnexApi -Method Post -Path $LoginEndpoint -Body @{ phone = $phone; password = $password; totp = $totp }
    $token = Get-PropValue -Object $loginResponse -Paths @(
        'data.accessToken', 'data.access_token', 'data.token',
        'data.data.accessToken', 'data.data.access_token', 'data.data.token',
        'accessToken', 'access_token', 'token'
    )
} catch {
    Write-Host "Dang nhap that bai: $($_.Exception.Message)" -ForegroundColor Red
}

if (-not $token) {
    Write-Host 'Khong lay duoc token dang nhap (kiem tra lai SDT/mat khau/OTP). Dung lai.' -ForegroundColor Red
    Read-Host 'Nhan Enter de dong'
    exit 1
}

Write-Host 'Dang nhap thanh cong.' -ForegroundColor Green
Write-Host ''

# ===== Buoc 2: Nhap bo loc =====
Write-Host '--- Bo loc du lieu doi soat ---' -ForegroundColor Cyan

$monthYear = Read-Host 'Nhap thang/nam can xuat (vd: 10/2026)'
if ($monthYear -notmatch '^(0?[1-9]|1[0-2])/(\d{4})$') {
    Write-Host 'Dinh dang khong hop le. Vui long nhap theo dang MM/YYYY, vi du 10/2026.' -ForegroundColor Red
    Read-Host 'Nhan Enter de dong'
    exit 1
}
$month = [int]$Matches[1]
$year = $Matches[2]
$reportDate = "$year-$($month.ToString('00'))"

$saleId = Read-Host 'Nhap ma sale de loc (de trong = lay tat ca CTV)'
Write-Host 'Trang thai de loc: de trong (tat ca) / FILE_CREATED / PAYMENT_CONFIRMED / UPDATED_SUCCESS / AUTO_CONFIRMED'
$status = Read-Host 'Nhap trang thai (de trong = tat ca)'

Write-Host ''
Write-Host "Dang tai lich su doi soat $(Format-ReportMonthLabel $reportDate)..." -ForegroundColor Yellow

# ===== Buoc 3: Tai toan bo du lieu (phan trang, giong fetchAllReconciliationHistory) =====
$allItems = New-Object System.Collections.Generic.List[object]
$totalElements = 0

for ($page = 0; $page -lt $MaxPages; $page++) {
    $result = Invoke-TnexApi -Method Post -Path $HistoryEndpoint -Token $token -Body @{
        saleId = $saleId; reportDate = $reportDate; status = $status; page = $page; size = $ExportPageSize
    }
    $data = Get-PropValue -Object $result -Paths @('data')
    if ($null -eq $data) { $data = $result }

    $pageItems = Get-PropValue -Object $data -Paths @('items', 'content', 'records')
    if ($null -eq $pageItems) { $pageItems = @() }
    $pageItems = @($pageItems)

    $totalElementsRaw = Get-PropValue -Object $data -Paths @('total', 'totalElements', 'pagination.totalElements')
    if ($null -ne $totalElementsRaw) { $totalElements = [int]$totalElementsRaw }

    foreach ($item in $pageItems) { $allItems.Add($item) }

    Write-Host ("  Đã tải {0}/{1} bản ghi (trang {2})..." -f $allItems.Count, $totalElements, ($page + 1))

    $reachedLastPage = ($pageItems.Count -eq 0) -or ($pageItems.Count -lt $ExportPageSize) -or (($totalElements -gt 0) -and ($allItems.Count -ge $totalElements))
    if ($reachedLastPage) { break }
}

if ($allItems.Count -eq 0) {
    Write-Host ''
    Write-Host 'Khong co ban ghi doi soat nao phu hop voi bo loc - khong tao file.' -ForegroundColor Yellow
    Read-Host 'Nhan Enter de dong'
    exit 0
}

# ===== Buoc 4: Tra cuu STK/CCCD/trang thai ky HD tung CTV (giong enrich trong ReconciliationHistoryPage.jsx) =====
$uniqueSaleIds = $allItems | ForEach-Object { $_.saleId } | Where-Object { $_ } | Select-Object -Unique
$contractStatusBySaleId = @{}
$bankAccountBySaleId = @{}
$identityBySaleId = @{}

Write-Host ''
Write-Host "Đang tra cứu thông tin $($uniqueSaleIds.Count) CTV (STK, CCCD, tình trạng ký HĐ)..." -ForegroundColor Yellow

$done = 0
foreach ($sid in $uniqueSaleIds) {
    $done++
    if (($done % 10 -eq 0) -or ($done -eq $uniqueSaleIds.Count)) {
        Write-Host ("  Đã tra cứu {0}/{1} CTV..." -f $done, $uniqueSaleIds.Count)
    }

    $targetSaleId = $sid -replace '(?i)^DR', ''
    $foundUserId = $null
    $foundContractStatus = $null

    for ($p = 0; $p -lt $SaleIdLookupMaxPages; $p++) {
        $usersResult = Invoke-TnexApi -Method Post -Path $SearchUsersEndpoint -Token $token -Body @{
            filter = @{ saleId = $targetSaleId; contractStatus = $null }; page = $p; size = $SaleIdLookupPageSize
        }
        $usersData = Get-PropValue -Object $usersResult -Paths @('data')
        if ($null -eq $usersData) { $usersData = $usersResult }

        $users = Get-PropValue -Object $usersData -Paths @('users', 'content', 'items', 'records')
        if ($null -eq $users) { $users = @() }
        $users = @($users)

        $match = $null
        foreach ($user in $users) {
            $raw = Get-PropValue -Object $user -Paths @('saleId', 'saleID', 'sale_id', 'saleCode', 'sale_code', 'ctvCode', 'ctv_code', 'code', 'referralCode')
            $normalized = [string]$raw -replace '(?i)^DR', ''
            if ($normalized -eq $targetSaleId) { $match = $user; break }
        }

        if ($match) {
            $foundUserId = Get-PropValue -Object $match -Paths @('id', 'userId', 'dsUserId', 'digitalSaleUserId', 'user_id')
            $foundContractStatus = Get-PropValue -Object $match -Paths @('contractStatus')
            break
        }

        $totalPagesRaw = Get-PropValue -Object $usersData -Paths @('pagination.totalPages', 'totalPages')
        $reachedLastUserPage = ($users.Count -eq 0) -or (($null -ne $totalPagesRaw) -and (($p + 1) -ge [int]$totalPagesRaw))
        if ($reachedLastUserPage) { break }
    }

    if (-not $foundUserId) {
        $contractStatusBySaleId[$sid] = 'LOOKUP_FAILED'
        $bankAccountBySaleId[$sid] = 'Không tra được'
        $identityBySaleId[$sid] = 'Không tra được'
    } else {
        $normalizedContractStatus = if ($foundContractStatus) { ([string]$foundContractStatus).ToUpper() } else { 'NOT_SIGNED' }
        try {
            $profileResult = Invoke-TnexApi -Method Get -Path $UserDetailEndpoint -Token $token -Query @{ id = $foundUserId }
            $detail = Get-PropValue -Object $profileResult -Paths @('data.user', 'data.profile', 'data')
            if ($null -eq $detail) { $detail = $profileResult }

            $bank = Get-PropValue -Object $detail -Paths @('bankInfo.accountNumber')
            $identity = Get-PropValue -Object $detail -Paths @('identity.identityNumber')

            $contractStatusBySaleId[$sid] = $normalizedContractStatus
            $bankAccountBySaleId[$sid] = if ($bank) { [string]$bank } else { '--' }
            $identityBySaleId[$sid] = if ($identity) { [string]$identity } else { '--' }
        } catch {
            $contractStatusBySaleId[$sid] = $normalizedContractStatus
            $bankAccountBySaleId[$sid] = 'Lỗi tra cứu'
            $identityBySaleId[$sid] = 'Lỗi tra cứu'
        }
    }

    Start-Sleep -Milliseconds $EnrichDelayMs
}

# ===== Buoc 5: Dung bang du lieu xuat file (giong exportReconciliationHistoryToExcel) =====
$rows = foreach ($item in $allItems) {
    $sid = $item.saleId
    $contractKey = if ($contractStatusBySaleId.ContainsKey($sid)) { $contractStatusBySaleId[$sid] } else { 'NOT_SIGNED' }
    $statusLabel = if ($StatusLabels.ContainsKey($item.status)) { $StatusLabels[$item.status] } else { $item.status }
    $contractLabel = if ($ContractLabels.ContainsKey($contractKey)) { $ContractLabels[$contractKey] } else { $ContractLabels['NOT_SIGNED'] }

    [PSCustomObject]@{
        SaleId         = [string]$sid
        ReportMonth    = Format-ReportMonthLabel $item.reportDate
        File           = $item.reconciliationFile
        CreatedAt      = Format-DateTimeLabel $item.createdAt
        UpdatedAt      = Format-DateTimeLabel $item.updatedAt
        Status         = $statusLabel
        ContractStatus = $contractLabel
        BankAccount    = if ($bankAccountBySaleId.ContainsKey($sid)) { [string]$bankAccountBySaleId[$sid] } else { '--' }
        Identity       = if ($identityBySaleId.ContainsKey($sid)) { [string]$identityBySaleId[$sid] } else { '--' }
    }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$baseName = "lich-su-doi-soat_${reportDate}_${timestamp}"
$xlsxPath = Join-Path $scriptDir "$baseName.xlsx"
$csvPath = Join-Path $scriptDir "$baseName.csv"
$headers = @('Mã sale', 'Tháng đối soát', 'File', 'Ngày tạo', 'Ngày cập nhật', 'Trạng thái', 'Ký hợp đồng', 'Số tài khoản TNEX', 'CCCD')

Write-Host ''
Write-Host 'Đang tạo file kết quả...' -ForegroundColor Yellow

# ===== Buoc 6: Xuat file - uu tien Excel that qua COM (neu may co cai Microsoft Excel), neu
# khong co Excel thi tu dong xuat ra CSV (van mo truc tiep duoc bang Excel) =====
$excel = $null
$usedExcelCom = $false

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Add()
    $sheet = $workbook.Worksheets.Item(1)
    $sheet.Name = 'Lich su doi soat'

    for ($c = 0; $c -lt $headers.Count; $c++) {
        $sheet.Cells.Item(1, $c + 1) = $headers[$c]
    }
    $headerRange = $sheet.Range($sheet.Cells.Item(1, 1), $sheet.Cells.Item(1, $headers.Count))
    $headerRange.Font.Bold = $true
    $headerRange.Interior.Color = 65535

    # Dinh dang Text cho cac cot ma/so TRUOC khi ghi du lieu - tranh Excel tu rut gon so 0 dau
    # (vd ma sale "046553" bi hieu thanh so 46553).
    $sheet.Columns.Item(1).NumberFormat = '@'
    $sheet.Columns.Item(8).NumberFormat = '@'
    $sheet.Columns.Item(9).NumberFormat = '@'

    $r = 2
    foreach ($row in $rows) {
        $sheet.Cells.Item($r, 1) = $row.SaleId
        $sheet.Cells.Item($r, 2) = $row.ReportMonth
        if ($row.File) {
            $sheet.Hyperlinks.Add($sheet.Cells.Item($r, 3), $row.File, '', '', 'File đối soát') | Out-Null
        } else {
            $sheet.Cells.Item($r, 3) = ''
        }
        $sheet.Cells.Item($r, 4) = $row.CreatedAt
        $sheet.Cells.Item($r, 5) = $row.UpdatedAt
        $sheet.Cells.Item($r, 6) = $row.Status
        $sheet.Cells.Item($r, 7) = $row.ContractStatus
        $sheet.Cells.Item($r, 8) = $row.BankAccount
        $sheet.Cells.Item($r, 9) = $row.Identity
        $r++
    }

    $sheet.UsedRange.Columns.AutoFit() | Out-Null
    $workbook.SaveAs($xlsxPath, 51)
    $workbook.Close($false)
    $excel.Quit()

    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($sheet)
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    $usedExcelCom = $true
} catch {
    $usedExcelCom = $false
    if ($excel) {
        try { $excel.Quit() } catch {}
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) } catch {}
    }
}

if (-not $usedExcelCom) {
    $rows |
        Select-Object @{N = 'Mã sale'; E = { $_.SaleId } }, @{N = 'Tháng đối soát'; E = { $_.ReportMonth } },
            @{N = 'File'; E = { $_.File } }, @{N = 'Ngày tạo'; E = { $_.CreatedAt } }, @{N = 'Ngày cập nhật'; E = { $_.UpdatedAt } },
            @{N = 'Trạng thái'; E = { $_.Status } }, @{N = 'Ký hợp đồng'; E = { $_.ContractStatus } },
            @{N = 'Số tài khoản TNEX'; E = { $_.BankAccount } }, @{N = 'CCCD'; E = { $_.Identity } } |
        Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8 -Delimiter ';'
}

Write-Host ''
if ($usedExcelCom) {
    Write-Host "Đã xuất $($allItems.Count) bản ghi ra file Excel:" -ForegroundColor Green
    Write-Host $xlsxPath -ForegroundColor Green
} else {
    Write-Host "Máy này không có Microsoft Excel nên đã xuất ra file CSV (mở trực tiếp được bằng Excel):" -ForegroundColor Yellow
    Write-Host $csvPath -ForegroundColor Green
}

Read-Host 'Nhan Enter de dong'
