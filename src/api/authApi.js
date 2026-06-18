import axiosClient from './axiosClient.js';
import { ENV } from '../config/env.js';

// Endpoint paths are sourced from env config so secrets and deployment URLs stay out of source.
export const authApi = {
  login(payload) {
    return axiosClient.post(ENV.LOGIN_ENDPOINT, payload);
  },
};
