import { atString } from '@pcardune/snax/dist/snax/errors';
import * as AST from '@pcardune/snax/dist/snax/spec-gen';

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

export const getLocationString = (location?: AST.Location) => {
  if (!location) {
    return '';
  }
  const parts = location.source.split('/');
  const source = parts[parts.length - 1];
  return atString({ ...location, source });
};
