export const disasterMapLayers = [
	{
		id: 'flood_inundation_130mm',
		source: 'flood_inundation_130mm',
		type: 'fill',
		paint: {
			'fill-color': '#1565C0',
			'fill-opacity': 0.6
		}
	},
	{
		id: 'road_closure',
		source: 'road_closure',
		type: 'line',
		paint: {
			'line-color': '#D32F2F',
			'line-dasharray': [2, 2],
			'line-width': 3
		}
	},
	{
		id: 'rainfall_station',
		source: 'rainfall_station',
		type: 'circle',
		paint: {
			'circle-color': '#F57C00',
			'circle-radius': [
				'interpolate',
				['linear'],
				['zoom'],
				10, 2,
				13, 4,
				16, 8,
				20, 15
			],
			'circle-stroke-width': 1,
			'circle-stroke-color': '#ffffff'
		}
	}
];
