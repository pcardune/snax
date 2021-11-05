const relTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export const formatTime = (time: number) => {
  const seconds = Math.trunc((time - new Date().getTime()) / 1000);
  const minutes = Math.trunc(seconds / 60);
  const hours = Math.trunc(minutes / 60);
  const days = Math.trunc(hours / 24);

  if (Math.abs(days) > 0) {
    return relTime.format(days, 'day');
  }
  if (Math.abs(hours) > 0) {
    return relTime.format(hours, 'hour');
  }
  if (Math.abs(minutes) > 0) {
    return relTime.format(minutes, 'minute');
  }
  return relTime.format(seconds, 'second');
};
