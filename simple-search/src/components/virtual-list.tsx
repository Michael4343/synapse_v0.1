'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

interface VirtualListProps<T> {
  items: T[]
  itemHeight: number
  containerHeight: number
  renderItem: (item: T, index: number) => React.ReactNode
  overscan?: number
  onLoadMore?: () => void
  hasMore?: boolean
  loadingMore?: boolean
  className?: string
}

export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  className = ''
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0)
  const scrollingRef = useRef<HTMLDivElement>(null)

  const visibleRange = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight)
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight),
      items.length - 1
    )

    // Add overscan items
    const startWithOverscan = Math.max(0, startIndex - overscan)
    const endWithOverscan = Math.min(items.length - 1, endIndex + overscan)

    return {
      start: startWithOverscan,
      end: endWithOverscan,
      startIndex,
      endIndex
    }
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan])

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end + 1)
  }, [items, visibleRange.start, visibleRange.end])

  const totalHeight = items.length * itemHeight
  const offsetY = visibleRange.start * itemHeight

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop
    setScrollTop(scrollTop)

    // Trigger load more when near bottom
    if (onLoadMore && hasMore && !loadingMore) {
      const scrollBottom = scrollTop + containerHeight
      const threshold = totalHeight - itemHeight * 3 // Load more when 3 items from bottom

      if (scrollBottom >= threshold) {
        onLoadMore()
      }
    }
  }

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (scrollingRef.current) {
        const newScrollTop = scrollingRef.current.scrollTop
        setScrollTop(newScrollTop)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      ref={scrollingRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, index) => {
            const actualIndex = visibleRange.start + index
            return (
              <div
                key={actualIndex}
                style={{ height: itemHeight }}
                className="flex-shrink-0"
              >
                {renderItem(item, actualIndex)}
              </div>
            )
          })}
        </div>

        {/* Loading more indicator */}
        {loadingMore && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: itemHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            className="text-slate-500 text-sm"
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"></div>
              Loading more...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default VirtualList