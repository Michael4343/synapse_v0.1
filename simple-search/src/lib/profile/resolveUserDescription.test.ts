import { describe, expect, it } from 'vitest'

import { resolveUserDescription } from './resolveUserDescription'

describe('resolveUserDescription', () => {
  it('prioritises a meaningful profile bio', () => {
    const result = resolveUserDescription({
      profileBio:
        'Computational neuroscientist investigating synaptic plasticity and large-scale brain simulation frameworks.',
      searchQueries: ['brain simulation', 'synaptic plasticity'],
    })

    expect(result.source).toBe('profile_bio')
    expect(result.description).toContain('Computational neuroscientist')
    expect(result.isFallback).toBe(false)
  })

  it('falls back to search queries when no meaningful bio exists', () => {
    const result = resolveUserDescription({
      profileBio: 'PhD candidate',
      searchQueries: ['climate resilience', 'urban adaptation', 'flood risk modelling'],
    })

    expect(result.source).toBe('search_queries')
    expect(result.description).toContain('climate resilience')
    expect(result.description).toContain('urban adaptation')
    expect(result.description).toContain('flood risk modelling')
  })

  it('uses ORCID signals when queries are absent', () => {
    const result = resolveUserDescription({
      orcid: {
        keywords: ['metabolomics', 'precision nutrition'],
        works: [{ title: 'Systems biology of metabolic pathways' }],
      },
    })

    expect(result.source).toBe('orcid_profile')
    expect(result.description).toContain('metabolomics')
    expect(result.description).toContain('precision nutrition')
  })

  it('returns a stable fallback when no signals exist', () => {
    const result = resolveUserDescription({})

    expect(result.source).toBe('fallback')
    expect(result.description.length).toBeGreaterThan(20)
    expect(result.isFallback).toBe(true)
  })
})

