# The Epylisian Genome

Academic portfolio and interactive research companion for a PhD in Bio-engineering at Ghent University.

**Dissertation (working title):**
*"Understanding the Epigenetic Dynamics of Aging through Modeling and Machine Learning"*

## What this is

A single-page academic landing site with live, canvas-rendered scientific figures. Each figure is an interactive simulation that illustrates a core idea of the dissertation: Waddington-style epigenetic landscapes, DNA-methylation clock dials, velocity fields over the methylation manifold, and knowledge-graph traversals. The site doubles as the public face of four ongoing research projects.

## Projects

| # | Title | Focus |
|---|-------|-------|
| I | **Dissecting the epigenetic clocks** | Decomposing Horvath, Hannum, PhenoAge and GrimAge at the CpG level to understand what each clock actually measures |
| II | **EpiFlow** | Flow-matching model that learns a velocity field over the methylation manifold, turning aging into directional trajectories rather than a scalar prediction |
| III | **Unsupervised genomic grammar** | Self-supervised transformer / SSM pre-trained on raw genome to recover regulatory logic (promoters, enhancers, methylation context) without supervision |
| IV | **OMIM discovery pipeline** | Three-phase agentic system (graph scoring, database cross-checks, mechanism evaluation) that proposes candidate genes and mechanisms for unsolved OMIM diseases |

## Structure

```
index.html                     Main landing page (all sections + Waddington sim)
project-epigenetic-clocks.html Project I detail page
project-epiflow.html           Project II detail page
project-genomic-grammar.html   Project III detail page
project-omim-pipeline.html     Project IV detail page (three-phase pipeline)
project-shared.css             Shared styles for project pages
project-shared.js              Shared JS for project pages
iife_a.js                      EpiFlow velocity-field canvas
iife_b.js                      Genome-strip velocity canvas
iife_d.js                      Epigenetic clock dial canvas
iife_e.js                      Waddington landscape simulation
iife_e_phase{1,2,3}.js         OMIM pipeline phase canvases
*.png                          Plate illustrations and project pictograms
```

## Running locally

Static HTML/CSS/JS -- no build step. Serve with any local server:

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then open `http://localhost:8000`.

## Author

**Niel Vanhamel**
PhD candidate, Bio-engineering, Ghent University
Niel.vanhamel@ugent.be
