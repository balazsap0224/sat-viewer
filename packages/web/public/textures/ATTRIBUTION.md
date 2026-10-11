# Texture attribution

Both images are produced by NASA and are in the public domain (NASA imagery is not copyrighted; see NASA's media usage guidelines). Credit is given as requested.

| File                                           | Source                                                                                                                                | Credit                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `earth-day-west.jpg`, `earth-day-east.jpg`     | Blue Marble: Next Generation, January 2004, topography and bathymetry, 21600×10800 source. https://visibleearth.nasa.gov/images/73580 | NASA Earth Observatory, Reto Stöckli, NASA Goddard Space Flight Center. Imagery by Reto Stöckli; Blue Marble data courtesy of the MODIS Land Group, MODIS Science Team, and others. |
| `earth-night-west.jpg`, `earth-night-east.jpg` | Black Marble 2016, 3 km resolution, 13500×6750 source. https://visibleearth.nasa.gov/images/144898                                    | NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA's Goddard Space Flight Center.                                                  |

Both are resized to 10800×5400 and split into a west half (longitude −180° to 0°) and an east half (0° to 180°), 5400×5400 each, by `scripts/prepare-textures.mjs` in the Orbital game repository (`../proj`), and copied here unchanged. Equirectangular projection, north at the top.
