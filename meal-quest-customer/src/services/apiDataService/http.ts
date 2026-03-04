import { apiRequestJson } from '@/adapters/api/client';

import { RequestOptions } from './contracts';

export const requestJson = async (options: RequestOptions) => {
  return apiRequestJson(options);
};
