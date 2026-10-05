import { formatDateTime } from './date.js';

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' },
};

const LINK_FONT = {
  color: { argb: 'FF1D4ED8' },
  underline: true,
};

function buildFileName(fileNameSuffix) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('') + '-' + [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  const suffix = fileNameSuffix ? `_${fileNameSuffix}` : '';

  return `lich-su-doi-soat${suffix}_${stamp}.xlsx`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const CONTRACT_STATUS_LABELS = {
  SIGNED: 'Đã ký',
  PENDING: 'Chờ ký',
  NOT_SIGNED: 'Chưa ký',
  // Tra cuu that that bai (khong tim duoc dung 1 user khop saleId) - PHAI hien thi khac voi
  // "Chua ky" that, neu khong se khong biet luc nao du lieu dang sai do loi tra cuu chu khong
  // phai CTV that su chua ky hop dong.
  LOOKUP_FAILED: 'Không tra được',
};

function getContractStatusLabel(saleId, contractStatusBySaleId) {
  const status = contractStatusBySaleId?.[saleId];

  return CONTRACT_STATUS_LABELS[status] || CONTRACT_STATUS_LABELS.NOT_SIGNED;
}

function getUserDetailField(saleId, userDetailFieldsBySaleId, field) {
  const value = userDetailFieldsBySaleId?.[saleId]?.[field];

  return value || '--';
}

export async function exportReconciliationHistoryToExcel({
  items,
  getStatusLabel,
  formatReportMonth,
  fileNameSuffix,
  contractStatusBySaleId = {},
  userDetailFieldsBySaleId = {},
}) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Lịch sử đối soát');

  sheet.columns = [
    // numFmt '@' = ep dinh dang Text - mot so ma sale toan chu so (vd "039235") se bi Excel
    // hieu nham la "so dang luu dang text" va hien canh bao tam giac xanh neu de dinh dang
    // "General" mac dinh. Khong doi gia tri, chi bao Excel dung hieu nham.
    { header: 'Mã sale', key: 'saleId', width: 16, style: { numFmt: '@' } },
    { header: 'Tháng đối soát', key: 'reportMonth', width: 18 },
    { header: 'File', key: 'file', width: 55 },
    { header: 'Ngày tạo', key: 'createdAt', width: 20 },
    { header: 'Ngày cập nhật', key: 'updatedAt', width: 20 },
    { header: 'Trạng thái', key: 'status', width: 16 },
    { header: 'Ký hợp đồng', key: 'contractStatus', width: 18 },
    { header: 'Số tài khoản TNEX', key: 'bankAccountNumber', width: 22, style: { numFmt: '@' } },
    { header: 'CCCD', key: 'identityNumber', width: 20, style: { numFmt: '@' } },
  ];

  const headerRow = sheet.getRow(1);

  // Dat chieu cao co dinh (customHeight) cho ca header lan tung dong du lieu - tranh Excel tu
  // tinh lai chieu cao khac nhau giua cac dong khi mo file (co the gay cam giac dong "chen"
  // vao nhau o 1 so trinh xem/zoom level).
  headerRow.height = 20;
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });

  items.forEach((item) => {
    const row = sheet.addRow({
      saleId: item.saleId || '',
      reportMonth: formatReportMonth(item.reportDate),
      file: item.reconciliationFile ? 'File đối soát' : '',
      createdAt: formatDateTime(item.createdAt),
      updatedAt: formatDateTime(item.updatedAt),
      status: getStatusLabel(item.status),
      contractStatus: getContractStatusLabel(item.saleId, contractStatusBySaleId),
      bankAccountNumber: getUserDetailField(item.saleId, userDetailFieldsBySaleId, 'bankAccountNumber'),
      identityNumber: getUserDetailField(item.saleId, userDetailFieldsBySaleId, 'identityNumber'),
    });

    row.height = 18;

    if (item.reconciliationFile) {
      const fileCell = row.getCell('file');

      fileCell.value = { text: 'File đối soát', hyperlink: item.reconciliationFile };
      fileCell.font = LINK_FONT;
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  downloadBlob(blob, buildFileName(fileNameSuffix));
}
