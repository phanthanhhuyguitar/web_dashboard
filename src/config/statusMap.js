export const LOAN_STATUSES = {
  FORSIGN: 'FORSIGN',
  APPROVAL: 'APPROVAL',
  FOR_DISBURSEMENT: 'FOR_DISBURSEMENT',
  CLOSED: 'CLOSED',
};

export const FUNNEL_STATUS_CONFIG = [
  {
    key: 'forsign',
    status: LOAN_STATUSES.FORSIGN,
    label: 'FORSIGN / CHỜ KÝ HĐ',
  },
  {
    key: 'approval',
    status: LOAN_STATUSES.APPROVAL,
    label: 'APPROVAL / CHỜ PHÊ DUYỆT',
  },
  {
    key: 'for-disbursement',
    status: LOAN_STATUSES.FOR_DISBURSEMENT,
    label: 'FOR_DISBURSEMENT / CHỜ GIẢI NGÂN',
  },
  {
    key: 'closed',
    status: LOAN_STATUSES.CLOSED,
    label: 'CLOSED / GIẢI NGÂN',
  },
];
