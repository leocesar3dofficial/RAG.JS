function formatDuration(ns) {
  let ms = Math.floor(ns / 1000000);
  let seconds = Math.floor(ms / 1000);
  ms = ms % 1000;
  let minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  let hours = Math.floor(minutes / 60);
  minutes = minutes % 60;

  let parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || minutes > 0 || hours > 0) parts.push(`${seconds}s`);
  parts.push(`${ms}ms`);

  return parts.join(' ');
}

function cleanToolResponse(response) {
  return response
    .replace('```json', '')
    .replace('```', '')
    .replace(/^:/, '')
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/\[:/g, '[')
    .trim();
}

function capitalizeWord(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export { formatDuration, cleanToolResponse, capitalizeWord };
