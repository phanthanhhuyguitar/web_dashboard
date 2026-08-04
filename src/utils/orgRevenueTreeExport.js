const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' },
};

function buildFileName() {
  const now = new Date();
  const stamp =
    [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('') +
    '-' +
    [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'), String(now.getSeconds()).padStart(2, '0')].join('');

  return `doanh-so-to-chuc_${stamp}.xlsx`;
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

// Xoe phang cay to chuc thanh danh sach dong theo dung thu tu hien thi tren UI (duyet truoc,
// depth-first) - giu nguyen cau truc cha/con da tinh san (disbursementAmount/closedLoanCount
// da duoc roll-up tu truoc, khong tinh lai o day).
function flattenTree(nodes, depth, rows) {
  nodes.forEach((node) => {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;

    rows.push({
      title: node.title,
      depth,
      closedLoanCount: node.closedLoanCount || 0,
      disbursementAmount: node.disbursementAmount || 0,
      hasChildren,
    });

    if (hasChildren) {
      flattenTree(node.children, depth + 1, rows);
    }
  });
}

export async function exportOrgRevenueTreeToExcel(nodes) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Doanh số tổ chức');

  sheet.columns = [
    { header: 'Tên tổ chức', key: 'title', width: 46 },
    { header: 'Số đơn', key: 'count', width: 14 },
    { header: 'Doanh số', key: 'amount', width: 20 },
  ];

  const headerRow = sheet.getRow(1);

  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });

  // Nhom/thu gon theo cap (giong Group and Outline cua Excel) - dong tong (cha) hien TREN
  // cac dong con, giong file mau.
  sheet.properties.outlineProperties = { summaryBelow: false };

  const rows = [];

  flattenTree(nodes, 0, rows);

  rows.forEach((rowData) => {
    const row = sheet.addRow({
      title: rowData.title,
      count: rowData.closedLoanCount,
      amount: rowData.disbursementAmount,
    });

    row.getCell('title').alignment = { indent: rowData.depth };
    row.getCell('amount').numFmt = '#,##0';

    if (rowData.hasChildren) {
      row.font = { bold: true };
    }

    if (rowData.depth > 0) {
      row.outlineLevel = rowData.depth;
    }
  });

  const grandTotalCount = nodes.reduce((sum, node) => sum + (node.closedLoanCount || 0), 0);
  const grandTotalAmount = nodes.reduce((sum, node) => sum + (node.disbursementAmount || 0), 0);
  const totalRow = sheet.addRow({ title: 'Grand Total', count: grandTotalCount, amount: grandTotalAmount });

  totalRow.font = { bold: true };
  totalRow.getCell('amount').numFmt = '#,##0';

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  downloadBlob(blob, buildFileName());
}
