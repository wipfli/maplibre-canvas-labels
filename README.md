# MapLibre Canvas Labels

Proof-of-concept to render Hindi text labels in a `canvas` and copying the resulting image to a MapLibre map.

Quite slow to load, a bit an ugly solution producing many console errors, but the result still looks OK I find...

## Demo

<a href="https://wipfli.github.io/maplibre-canvas-labels">

<img src="screenshot.png" width=450>

</a>

## Try out locally

Map tiles from swiss-map.cc have cors for `localhost:3000`, so if you want to try this out locally, serve `index.html` at port 3000 for example with:

`npx serve`

## Base Map Style

https://github.com/wipfli/swiss-map
