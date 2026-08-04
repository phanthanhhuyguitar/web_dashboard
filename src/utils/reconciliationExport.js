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
};

// Khong co trang thai ghi nhan (DRAFT, rong, hoac khong tim thay) deu tinh la "Chưa ký".
function getContractStatusLabel(saleId, contractStatusBySaleId) {
  return CONTRACT_STATUS_LABELS[contractStatusBySaleId?.[saleId]] || 'Chưa ký';
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
    { header: 'Mã sale', key: 'saleId', width: 16 },
    { header: 'Tháng đối soát', key: 'reportMonth', width: 18 },
    { header: 'File', key: 'file', width: 55 },
    { header: 'Ngày tạo', key: 'createdAt', width: 20 },
    { header: 'Ngày cập nhật', key: 'updatedAt', width: 20 },
    { header: 'Trạng thái', key: 'status', width: 16 },
    { header: 'Ký hợp đồng', key: 'contractStatus', width: 18 },
    { header: 'Số tài khoản TNEX', key: 'bankAccountNumber', width: 22 },
    { header: 'CCCD', key: 'identityNumber', width: 20 },
  ];

  const headerRow = sheet.getRow(1);

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
