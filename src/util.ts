export const getBasename = (url: string): string => {
  return url.split('/').pop()?.split('.')[0] ?? '';
};
