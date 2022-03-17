import React, { useRef, useEffect, useState, useCallback } from 'react'
import mapboxgl from '!mapbox-gl' // eslint-disable-line import/no-webpack-loader-syntax
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import MapboxGeocoder from 'mapbox-gl-geocoder'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import 'mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css'
import Area from '@turf/area'
import BBox from '@turf/bbox'
import { arcgisToGeoJSON } from '@terraformer/arcgis'

import './MapContainer.scss'

//constants to set up the map
import {
  MAP_DEFAULTS,
  ZOOM_LEVELS,
  ESRI_QUERY_DEFAULTS,
  MAP_RESTRICTIONS,
} from '../../geom'

mapboxgl.accessToken = process.env.REACT_APP_MAPBOXGL_TOKEN
const baseUrl = process.env.REACT_APP_MAPSERVER_BASEURL
//TODO: add loading from previous project
function MapContainer({
  currentBoundary,
  setCurrentBoundary,
  currentAreas,
  setCurrentAreas,
}) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const draw = useRef(null)
  const geoCoder = useRef(null)
  const previousZoom = useRef(MAP_DEFAULTS.ZOOM)
  const [lng, setLng] = useState(MAP_DEFAULTS.CENTER[0])
  const [lat, setLat] = useState(MAP_DEFAULTS.CENTER[1])
  const [zoom, setZoom] = useState(MAP_DEFAULTS.ZOOM)

  // function getZoomLevel(zoom) {
  //   console.log(zoom)
  //   switch (true) {
  //     case zoom >= 17:
  //       return ZOOMS[ZOOMS.length - 1]
  //     case zoom < 17 && zoom >= 15:
  //       return ZOOMS[ZOOMS.length - 2]
  //     case zoom < 15 && zoom >= 13:
  //       return ZOOMS[ZOOMS.length - 3]
  //     case zoom < 13 && zoom >= 12:
  //       console.log('HERE')
  //       return ZOOMS[ZOOMS.length - 4]
  //     case zoom < 12 && zoom >= 11:
  //       return ZOOMS[ZOOMS.length - 5]
  //     case zoom < 11 && zoom >= 6:
  //       return ZOOMS[ZOOMS.length - 6]
  //     default:
  //       return ZOOMS[ZOOMS.length - 7]
  //   }
  // }

  // TODO: decuple from callback / move it to API (add cache)
  const fetchAreas = useCallback(
    (bbox) => {
  async function doFetch(bbox) {
    const zoom = Math.ceil(map.current.getZoom())
    const zoomlevel = ZOOM_LEVELS.filter(
      (l) => zoom < l.zoom[0] && zoom >= l.zoom[1]
    )[0]
    try {
      const queryParams = Object.assign({}, ESRI_QUERY_DEFAULTS, {
        geometry: bbox.toString(),
        outFields: zoomlevel.fields.toString(),
      })
      const url = `${baseUrl}/${zoomlevel.path}/MapServer/${
        zoomlevel.layer
      }/query?${new URLSearchParams(queryParams).toString()}`
      const response = await fetch(url)
      if (!response.ok) {
        // TODO: add to overall error handling
        throw new Error(`HTTP error: ${response.status}`)
      }
      let json = await response.json()
      if (ESRI_QUERY_DEFAULTS.f === 'pjson') json = arcgisToGeoJSON(json)
      const areas = json.features.map((fe) => fe.properties[zoomlevel.field])
      setCurrentAreas(areas)
      // add/replace areas on map
      map.current.getSource('area').setData(json)
    } catch (error) {
      //TODO: add to overall error handling
      console.error(`Could not get areas: ${error}`)
    }
  }
  doFetch(bbox)
},[setCurrentAreas])

  const updateArea = useCallback(
    (e) => {
      const data = draw.current.getAll()
      const answer = document.getElementById('calculated-area')
      if (data.features.length > 0) {
        // remove previus boundaries
        const pids = []
        const lid = data.features[data.features.length - 1].id
        data.features.forEach((f) => {
          if (f.geometry.type === 'Polygon' && f.id !== lid) {
            pids.push(f.id)
          }
        })
        draw.current.delete(pids)
        const area = Area(data)
        fetchAreas(BBox(data))
        setCurrentBoundary(data)
        // Restrict the area to 2 decimal points.
        const rounded_area = Math.round(area * 100) / 100
        answer.innerHTML = `<p><strong>${rounded_area}</strong></p><p>square meters</p>`
      } else {
        answer.innerHTML = ''
        if (e.type !== 'draw.delete') alert('Click the map to draw a polygon.')
      }
    },
    [setCurrentBoundary, fetchAreas]
  )

  useEffect(() => {
    if (map.current) return // initialize map only once
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v11?optimize=true',
      center: [lng, lat],
      zoom: zoom,
      maxBounds: MAP_RESTRICTIONS.BOUNDS,
    })
    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      // Select which mapbox-gl-draw control buttons to add to the map.
      controls: {
        polygon: true,
        trash: true,
      },
      // Set mapbox-gl-draw to draw by default.
      // The user does not have to click the polygon control button first.
      defaultMode: 'draw_polygon',
    })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-left')
    map.current.addControl(draw.current, 'top-left')

    geoCoder.current = new MapboxGeocoder({
      accessToken: mapboxgl.accessToken,
      mapboxgl: mapboxgl,
    })
    map.current.addControl(geoCoder.current)

    //   areas: {
    //     name: 'Areas',
    //     type: 'geoJSONShape',
    //     data: [],
    //     visible: true,
    //     layerParams: {
    //         showOnSelector: false
    //     },
    //     layerOptions: {
    //         style: {
    //             color: 'white',
    //             fillColor: '#FD8D3C',
    //             weight: 2.0,
    //             dashArray: '3',
    //             opacity: 0.6,
    //             fillOpacity: 0.2
    //         },
    //         onEachFeature: onEachFeature
    //     }
    // }

    map.current.on('load', () => {
      map.current.addSource('area', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.current.addLayer({
        id: 'area',
        type: 'fill',
        source: 'area', // reference the data source
        layout: {},
        paint: {
          'fill-color': '#0080ff',
          'fill-opacity': 0.2,
          'fill-outline-color': 'white',
        },
      })
      map.current.addLayer({
        id: 'outline',
        type: 'line',
        source: 'area',
        layout: {},
        paint: {
          'line-color': '#000',
          'line-width': 3,
        },
      })
    })
  })

  useEffect(() => {
    if (!map.current) return // wait for map to initialize
    map.current.on('draw.create', updateArea)
    map.current.on('draw.delete', updateArea)
    map.current.on('draw.update', updateArea)
  }, [updateArea])


  useEffect(() => {
    if (!map.current) return // wait for map to initialize
    map.current.on('move', () => {
      setLng(map.current.getCenter().lng.toFixed(4))
      setLat(map.current.getCenter().lat.toFixed(4))
      setZoom(map.current.getZoom().toFixed(2))
      // TODO: check if zoom changes enough to do area request again
      if (currentBoundary) {
        if (Math.abs(previousZoom.current - map.current.getZoom()) > 1) {
          previousZoom.current = map.current.getZoom()
          if (
            !(map.current.getZoom() > MAP_RESTRICTIONS.MAX_ZOOM_LEVEL) &&
            !(map.current.getZoom() < MAP_RESTRICTIONS.MIN_ZOOM_LEVEL)
          )
            fetchAreas(BBox(currentBoundary))
        }
      }
    })
  }, [currentBoundary,fetchAreas])

  return (
    <div>
      <div ref={mapContainer} className="map-container">
        <div className="sidebar">
          Longitude: {lng} | Latitude: {lat} | Zoom: {zoom}
        </div>
      </div>
      <div className="calculation-box">
        <p>Click the map to draw a polygon.</p>
        <div id="calculated-area"></div>
        <div id="areas">{currentAreas}</div>
      </div>
    </div>
  )
}

export default React.memo(MapContainer)
