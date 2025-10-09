export interface SimilarPaperDigest {
  id: string
  title: string
  authors: string
  venue: string
  year: string
  summary: string
  highlight: string
  methods: string[]
  findings: string[]
}

export const SAMPLE_SIMILAR_PAPERS: Record<string, SimilarPaperDigest[]> = {
  '68d962effe5520777791bd6ec8ffa4b963ba4f38': [
    {
      id: 'crispr-lab-bridges',
      title: 'Cas9 delivery toolkits across mammalian systems',
      authors: 'Cong et al. | Mali et al.',
      venue: 'Nature Methods & Science',
      year: '2013–2014 cohort',
      summary:
        'Highlights parallel teams adapting RNA-guided nucleases to primary mammalian cells with a focus on delivery mechanics and off-target controls.',
      highlight:
        'Use these playbooks when planning vector packaging, nickase variants, and guide validation workflows before scaling to therapeutic models.',
      methods: [
        'Side-by-side evaluation of lentiviral vs. plasmid vs. ribonucleoprotein delivery.',
        'GUIDE-seq and T7 endonuclease assays to quantify off-target edits.',
        'Optimised sgRNA scaffolds for multiplex gene targeting.'
      ],
      findings: [
        'RNP delivery shaved 24 hours off editing timelines with cleaner off-target signatures.',
        'Multiplexed sgRNAs enabled rapid knockout panels for pathway screening.',
        'Lentiviral systems offered the best balance for hard-to-transfect cell types.'
      ]
    },
    {
      id: 'crispr-therapeutics-scout',
      title: 'Preclinical CRISPR programs moving toward the clinic',
      authors: 'Smith et al. | Ding et al.',
      venue: 'Nature Biotechnology & Cell',
      year: '2014–2016 transition',
      summary:
        'Tracks translational teams hardening the Cas9 platform for therapeutic delivery, with attention on immune profiling and dose ceilings.',
      highlight:
        'Borrow their immune-response assays and biodistribution checklists when de-risking in vivo programmes.',
      methods: [
        'Combinatorial AAV capsid libraries benchmarked for tissue tropism.',
        'Innate immune activation panels (cytokine/chemokine profiling).',
        'Pharmacokinetic modelling of nuclease persistence across organs.'
      ],
      findings: [
        'Identified capsid-serotype pairs that minimise neutralising antibody rebound.',
        'Mapped safe exposure windows to keep Cas9 expression within tolerable immune thresholds.',
        'Outlined dose fractionation schemes that preserved editing efficiency.'
      ]
    },
    {
      id: 'crispr-ethics-frameworks',
      title: 'Governance and reproducibility frameworks for gene editing',
      authors: 'Berg et al. | Baltimore et al.',
      venue: 'Nature | Science policy forum',
      year: '2015 consensus',
      summary:
        'Zooms out to the policy and reproducibility debates that codified responsible CRISPR deployment across global labs.',
      highlight:
        'Use this literature to align lab SOPs with emerging governance expectations and publication standards.',
      methods: [
        'Meta-analyses of off-target reporting practices pre- and post-2015.',
        'Workshop-derived reproducibility checklists adopted by major journals.',
        'Comparative surveys of international regulatory positions on germline editing.'
      ],
      findings: [
        'Standardised reporting templates boosted cross-lab replication success rates.',
        'Policy bodies converged on moratoria for germline work while encouraging somatic trials.',
        'Highlighted the need for community databases tracking guide performance metrics.'
      ]
    }
  ],
  abd1c342495432171beb7ca8fd9551ef13cbd0ff: [
    {
      id: 'alexnet-architectures-evolution',
      title: 'From AlexNet to modern convnets',
      authors: 'Simonyan & Zisserman | He et al.',
      venue: 'ICLR & CVPR',
      year: '2014–2016 iterations',
      summary:
        'Dissects architectural refinements—deeper stacks, residual shortcuts, batch normalisation—that carried ImageNet accuracy forward.',
      highlight:
        'Great starting point when benchmarking updated baselines or migrating legacy code to current frameworks.',
      methods: [
        'Layer depth scaling studies with controlled parameter budgets.',
        'Residual skip experiments quantifying gradient stability gains.',
        'Batch normalisation ablation runs on ImageNet subsets.'
      ],
      findings: [
        'Residual blocks unlocked >2% accuracy gains without overfitting.',
        'Batch norm reduced training time by ~30% across GPU clusters.',
        'Deeper but width-balanced models generalised best to transfer tasks.'
      ]
    },
    {
      id: 'alexnet-hardware-optimisation',
      title: 'Systems engineering for large-scale vision models',
      authors: 'Jia et al. | Krizhevsky (DistBelief notes)',
      venue: 'NIPS workshops & tech reports',
      year: '2013–2015 infrastructure',
      summary:
        'Catalogues infrastructure upgrades—mixed precision, distributed data loading, kernel fusion—that kept training runs tractable.',
      highlight:
        'Replicate these playbooks when squeezing more throughput out of existing GPU clusters.',
      methods: [
        'Asynchronous data pipeline designs with sharded cache layers.',
        'Mixed-precision training benchmarks across GPU architectures.',
        'Custom CUDA kernel fusion for convolution + activation passes.'
      ],
      findings: [
        'Pinned-memory loaders eliminated IO stalls on >1M image epochs.',
        'FP16/FP32 hybrid training halved memory usage with negligible accuracy loss.',
        'Kernel fusion netted ~18% wall-clock speedups in production pipelines.'
      ]
    },
    {
      id: 'alexnet-transfer-learning',
      title: 'Transfer and fine-tuning strategies after ImageNet',
      authors: 'Donahue et al. | Yosinski et al.',
      venue: 'CVPR & ICML',
      year: '2014 generalisation studies',
      summary:
        'Explores how ImageNet-trained embeddings migrate to downstream tasks, detailing layer-freezing heuristics and dataset-specific tweaks.',
      highlight:
        'Reach for these results when adapting legacy backbones to niche datasets or limited labels.',
      methods: [
        'Layer-wise feature transferability diagnostics on varied datasets.',
        'Fine-tuning schedules comparing learning rate decay policies.',
        'Low-shot experiments using frozen vs. partially unfrozen backbones.'
      ],
      findings: [
        'Mid-level convolutional features remained the most reusable across domains.',
        'Two-stage fine-tuning (classifier head first, then partial unfreeze) gave the best accuracy/time trade-off.',
        'Low-shot tasks benefited from aggressive data augmentation paired with shallow adapters.'
      ]
    }
  ],
  c92bd747a97eeafdb164985b0d044caa1dc6e73e: [
    {
      id: 'graphene-production',
      title: 'Scaling graphene exfoliation and growth',
      authors: 'Li et al. | Kim et al.',
      venue: 'Science & Nature Nanotechnology',
      year: '2008–2010 fabrication wave',
      summary:
        'Collects fabrication recipes—CVD, epitaxial growth, chemical exfoliation—that unlocked wafer-scale graphene production.',
      highlight:
        'Useful when benchmarking substrate prep, growth temperatures, and transfer techniques for reproducible graphene films.',
      methods: [
        'Chemical vapour deposition on copper and nickel foils.',
        'Low-pressure methane flows tuned for mono-layer coverage.',
        'Polymer-assisted transfer protocols to preserve crystal integrity.'
      ],
      findings: [
        'Identified annealing windows that minimise grain boundary defects.',
        'Documented transfer steps that keep mobility above 10,000 cm²/V·s.',
        'Showed nickel substrates favour multilayer growth without careful cooling ramps.'
      ]
    },
    {
      id: 'graphene-characterisation',
      title: 'Quantifying electronic behaviour in 2D carbon',
      authors: 'Zhang et al. | Novoselov et al.',
      venue: 'Nature Physics & PNAS',
      year: '2005–2007 property mapping',
      summary:
        'Focuses on measurement techniques probing carrier mobility, quantum Hall signatures, and tunable bandgaps in graphene.',
      highlight:
        'Leverage these measurement standards to compare lab-grown samples against community baselines.',
      methods: [
        'Low-temperature magnetotransport measurements for quantum Hall plateaus.',
        'Four-point probe setups capturing sheet resistance variability.',
        'Raman spectroscopy fingerprints for layer counting and strain mapping.'
      ],
      findings: [
        'Confirmed relativistic electron behaviour with half-integer quantum Hall effect.',
        'Correlated Raman 2D peak symmetry with high-mobility monolayers.',
        'Demonstrated electric field tuning of carrier type via simple back gates.'
      ]
    },
    {
      id: 'graphene-applications',
      title: 'Device concepts leveraging graphene properties',
      authors: 'Schedin et al. | Geim & Novoselov',
      venue: 'Nature Materials & Reviews',
      year: '2007–2010 application focus',
      summary:
        'Surfaces sensor, photonics, and flexible electronics prototypes that pushed graphene beyond a laboratory curiosity.',
      highlight:
        'Review these blueprints before launching application-focused projects or industry collaborations.',
      methods: [
        'Gas sensor functionalisation with single-molecule detection benchmarks.',
        'Graphene-based transparent electrode fabrication for flexible displays.',
        'Hybrid stacking with dielectrics to craft tunable photodetectors.'
      ],
      findings: [
        'Achieved parts-per-billion detection limits for common air pollutants.',
        'Demonstrated bendable touch panels maintaining conductivity over 10k cycles.',
        'Outlined photodetector response curves surpassing silicon analogues in the IR band.'
      ]
    }
  ],
  fc448a7db5a2fac242705bd8e37ae1fc4a858643: [
    {
      id: 'genome-consortium-methods',
      title: 'Shotgun sequencing strategies for large genomes',
      authors: 'Venter et al. | Waterston et al.',
      venue: 'Science & Nature',
      year: '2001 companion studies',
      summary:
        'Contrasts whole-genome shotgun and hierarchical clone-by-clone approaches used in parallel during the Human Genome Project.',
      highlight:
        'Essential reading when planning assembly workflows or explaining why hybrid pipelines remain popular.',
      methods: [
        'BAC tiling path construction with Sanger sequencing.',
        'Whole-genome shotgun libraries with paired-end reads.',
        'Cross-validation pipelines aligning draft assemblies across teams.'
      ],
      findings: [
        'Hybrid assembly approaches resolved repeats the fastest while maintaining accuracy.',
        'Public-private comparison showed concordance above 99.9% on shared regions.',
        'Identified key gap regions requiring targeted clone finishing.'
      ]
    },
    {
      id: 'genome-annotation-landscape',
      title: 'Interpreting the human gene catalogue',
      authors: 'Lander et al. | GENCODE consortium',
      venue: 'Nature & Genome Research',
      year: '2001–2003 annotation wave',
      summary:
        'Charts the first systematic passes at annotating genes, transcripts, and regulatory elements from the draft sequence.',
      highlight:
        'Use this set to understand how transcript models and comparative genomics informed the earliest human gene counts.',
      methods: [
        'Comparative genomics with mouse and pufferfish to prioritise conserved elements.',
        'Full-length cDNA capture to validate predicted transcripts.',
        'Manual curation pipelines integrating EST clusters and protein homology.'
      ],
      findings: [
        'Revised human gene estimates downward to ~22k protein-coding loci.',
        'Documented pervasive alternative splicing across tissue panels.',
        'Highlighted regulatory deserts and gene-rich islands shaping genome architecture.'
      ]
    },
    {
      id: 'genome-ethics-outreach',
      title: 'ELSI lessons from big-science genomics',
      authors: 'Collins et al. | Hudson et al.',
      venue: 'Nature Reviews Genetics & PNAS',
      year: '2003 translational reflections',
      summary:
        'Captures the ethical, legal, and social implications program responses to data sharing, consent, and equitable access.',
      highlight:
        'Frame consent forms, data governance, and community partnerships with these case studies in mind.',
      methods: [
        'Policy analysis of data release timetables across public/private efforts.',
        'Surveys measuring public trust before and after major genome milestones.',
        'Frameworks for community advisory panels guiding downstream research.'
      ],
      findings: [
        'Rapid-release policies accelerated downstream discoveries without harming participant privacy.',
        'Public trust hinged on transparent communication of data use and benefits.',
        'Community advisory structures became standard for large-scale biomedical cohorts.'
      ]
    }
  ]
}
