type SilentablePayload = Record<string, any> | FormData;

export const ensureSilentUpdate = (payload?: SilentablePayload) => {
  if (!payload) return;

  if (payload instanceof FormData) {
    payload.set('silentUpdate', 'true');
    return;
  }

  if (typeof payload === 'object') {
    payload.silentUpdate = true;
  }
};
