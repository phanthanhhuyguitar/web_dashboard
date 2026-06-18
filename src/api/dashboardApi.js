import { dashboardMock } from '../data/dashboardMock.js';

export const dashboardApi = {
  async getDashboardOverview(params = {}) {
    void params;

    // TODO: Replace this mock response with an Axios call when the real dashboard API is available.
    // Example:
    // return axiosClient.get('/digital-sale-admin/api/v1/admin/dashboard/overview', { params });
    return Promise.resolve(dashboardMock);
  },
};
