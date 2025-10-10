export function formatRelativeTime(timestamp: string): string {
  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) {
    return ''
  }

  const diff = Date.now() - value.getTime()
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) {
    return rtf.format(Math.round(-diff / 1000), 'second')
  }
  if (diff < hour) {
    return rtf.format(Math.round(-diff / minute), 'minute')
  }
  if (diff < day) {
    return rtf.format(Math.round(-diff / hour), 'hour')
  }
  if (diff < day * 7) {
    return rtf.format(Math.round(-diff / day), 'day')
  }

  return value.toLocaleDateString()
}
