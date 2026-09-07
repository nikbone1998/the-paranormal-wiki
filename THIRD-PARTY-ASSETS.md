# Earth runtime provenance

- Three.js module: `three@0.180.0` via jsDelivr.
- Base Earth textures: Three.js `examples/textures/planets` pinned to repository commit `4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd`.
- Progressive high-resolution daylight texture: NASA Earth Observatory / Blue Marble Next Generation, `world.topo.bathy.200412.3x5400x2700.jpg`. NASA imagery is used under NASA's public-media guidance.
- Progressive high-resolution night-light texture: NASA Earth Observatory / Black Marble 2016, `BlackMarble_2016_3km.jpg`. NASA imagery is used under NASA's public-media guidance.
- Progressive cloud-alpha and land/ocean specular textures: `matteason/daily-cloud-maps`, published under CC0 1.0 and derived from NASA imagery. The renderer treats these only as visual textures and does not present them as live telemetry.
- Regional deep-zoom imagery: NASA Global Imagery Browse Services (GIBS), `Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual`, annual 2010-12-01 visualization, `GoogleMapsCompatible_Level12`. The underlying NASA Global Web-Enabled Landsat Data annual product is 30 m source data. Regional tiles are requested only as the camera approaches Earth and are not represented as live imagery.
- Terrain relief: AWS Registry of Open Data `Terrain Tiles`, managed by Mapzen / Tilezen. Terrarium PNG tiles provide bare-earth elevation values and are decoded in-browser for true-scale radial displacement where CORS/device capability permits. Attribution requirements are inherited from the Terrain Tiles source dataset documentation.
- The Earth layer is an original integration using those renderer/texture resources. No paranormal entity coordinates, case markers, dossier links, or geographic entity data are bundled in this Earth-engine phase.
