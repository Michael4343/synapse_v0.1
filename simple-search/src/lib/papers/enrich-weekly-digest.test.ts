import { describe, expect, it, vi } from 'vitest'

import { resolveAbstractForPaper } from './enrich-weekly-digest'

const BASE_PAPER = {
  paperId: 'S2:123',
  title: 'Advances in Sustainable Materials for Grid-scale Storage',
  abstract: null,
  authors: [{ name: 'A. Researcher' }, { name: 'B. Scientist' }],
  year: 2025,
  venue: 'Energy Letters',
  citationCount: 5,
  url: 'https://example.com/paper',
  externalIds: {},
  publicationDate: '2025-03-01',
} as const

describe('resolveAbstractForPaper', () => {
  it('hydrates from Crossref when DOI is available', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            abstract: '<p>This is a rich abstract with <b>markup</b>.</p>',
          },
        }),
      })

    const result = await resolveAbstractForPaper(
      {
        ...BASE_PAPER,
        externalIds: { DOI: '10.1000/test.doi' },
      } as any,
      mockFetch as any
    )

    expect(result.source).toBe('crossref')
    expect(result.abstract).toBe('This is a rich abstract with markup.')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toContain('api.crossref.org')
  })

  it('falls back to PubMed when DOI lookup fails but PMID exists', async () => {
    const responses = [
      { ok: false, status: 404 },
      {
        ok: true,
        status: 200,
        text: async () => 'Line one of the abstract.\nLine two provides more detail.',
      },
    ]

    const mockFetch = vi.fn(() => Promise.resolve(responses.shift() as any))

    const result = await resolveAbstractForPaper(
      {
        ...BASE_PAPER,
        externalIds: { DOI: '10.1000/test.doi', PMID: '12345678' },
      } as any,
      mockFetch as any
    )

    expect(result.source).toBe('pubmed')
    expect(result.abstract).toBe('Line one of the abstract. Line two provides more detail.')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[1][0]).toContain('eutils.ncbi.nlm.nih.gov')
  })

  it('synthesises a placeholder when no external abstracts resolve', async () => {
    const mockFetch = vi.fn()

    const result = await resolveAbstractForPaper(BASE_PAPER as any, mockFetch as any)

    expect(result.source).toBe('generated')
    expect(result.abstract).toContain('No abstract was supplied')
    expect(result.abstract).toContain(BASE_PAPER.title)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
