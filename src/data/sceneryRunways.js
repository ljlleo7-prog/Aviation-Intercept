export default {
  "KLGA": {
    "airport": {
      "icao": "KLGA",
      "iata": "LGA",
      "name": "LaGuardia Airport",
      "latitude": 40.777199,
      "longitude": -73.872597,
      "elevation": 21,
      "type": "normal"
    },
    "provenance": {
      "airportCode": "KLGA",
      "endpoint": "https://overpass.kumi.systems/api/interpreter",
      "query": "[out:json][timeout:55];(nwr[\"aeroway\"=\"aerodrome\"][\"icao\"=\"KLGA\"](40.755,-73.9,40.798,-73.845);nwr[\"aeroway\"](40.755,-73.9,40.798,-73.845);way[\"highway\"=\"service\"](40.755,-73.9,40.798,-73.845);way[\"amenity\"=\"parking\"](40.755,-73.9,40.798,-73.845););out geom;",
      "fetchedAt": "2026-10-19T11:58:37.662Z",
      "licence": "ODbL-1.0",
      "attribution": "© OpenStreetMap contributors",
      "sourceTimestamp": "2026-07-24T11:04:51Z",
      "sourceFile": "sources/KLGA.osm.json",
      "copyright": "https://www.openstreetmap.org/copyright"
    },
    "runways": [
      [
        "13",
        "31",
        40.7823019,
        -73.8785247,
        40.7720798,
        -73.8571112,
        7000.795551824042,
        150.91863517060366,
        21
      ],
      [
        "04",
        "22",
        40.7691673,
        -73.8841225,
        40.7854385,
        -73.8706827,
        7009.339439591932,
        150,
        21
      ]
    ]
  },
  "ZSPD": {
    "airport": {
      "icao": "ZSPD",
      "iata": "PVG",
      "name": "Shanghai Pudong International Airport",
      "latitude": 31.1434,
      "longitude": 121.805,
      "elevation": 13,
      "type": "normal"
    },
    "provenance": {
      "airportCode": "ZSPD",
      "endpoint": "https://overpass-api.de/api/interpreter",
      "query": "[out:json][timeout:55];(nwr[\"aeroway\"=\"aerodrome\"][\"icao\"=\"ZSPD\"](31.105,121.755,31.19,121.855);nwr[\"aeroway\"](31.105,121.755,31.19,121.855););out geom;",
      "fetchedAt": "2026-10-19T11:59:59.778Z",
      "licence": "ODbL-1.0",
      "attribution": "© OpenStreetMap contributors",
      "sourceTimestamp": "2026-10-19T11:57:56Z",
      "sourceFile": "sources/ZSPD.osm.json",
      "copyright": "https://www.openstreetmap.org/copyright"
    },
    "runways": [
      [
        "17L",
        "35R",
        31.1612362,
        121.7859609,
        31.1269241,
        121.7989034,
        13168.427055225851,
        196.85039370078738,
        13
      ],
      [
        "16R",
        "34L",
        31.158963,
        121.8117255,
        31.1263548,
        121.824029,
        12514.854212498247,
        196.85039370078738,
        13
      ],
      [
        "17R",
        "35L",
        31.1548072,
        121.7833164,
        31.1256412,
        121.7943052,
        11192.22851859473,
        196.85039370078738,
        13
      ],
      [
        "16L",
        "34R",
        31.1601853,
        121.8161313,
        31.1275748,
        121.828412,
        12513.465400243218,
        196.85039370078738,
        13
      ],
      [
        "15",
        "33",
        31.1513272,
        121.8387429,
        31.1221443,
        121.8497506,
        11199.916686638007,
        196.85039370078738,
        13
      ]
    ]
  },
  "ZGGG": {
    "airport": {
      "icao": "ZGGG",
      "iata": "CAN",
      "name": "Guangzhou Baiyun International Airport",
      "latitude": 23.392401,
      "longitude": 113.299004,
      "elevation": 50,
      "type": "normal"
    },
    "provenance": {
      "airportCode": "ZGGG",
      "endpoint": "https://overpass-api.de/api/interpreter",
      "query": "[out:json][timeout:55];(nwr[\"aeroway\"=\"aerodrome\"][\"icao\"=\"ZGGG\"](23.34,113.25,23.435,113.345);nwr[\"aeroway\"](23.34,113.25,23.435,113.345);way[\"highway\"=\"service\"](23.34,113.25,23.435,113.345);way[\"amenity\"=\"parking\"](23.34,113.25,23.435,113.345););out geom;",
      "fetchedAt": "2026-10-19T11:59:41.372Z",
      "licence": "ODbL-1.0",
      "attribution": "© OpenStreetMap contributors",
      "sourceTimestamp": "2026-10-19T11:57:56Z",
      "sourceFile": "sources/ZGGG.osm.json",
      "copyright": "https://www.openstreetmap.org/copyright"
    },
    "runways": [
      [
        "02L",
        "20R",
        23.3756648,
        113.3053576,
        23.40895,
        113.3143241,
        12522.570255686587,
        196.85039370078738,
        50
      ],
      [
        "01R",
        "19L",
        23.3768913,
        113.2834873,
        23.4084555,
        113.2919923,
        11875.264765152933,
        147.63779527559055,
        50
      ],
      [
        "02R",
        "20L",
        23.3694573,
        113.3077131,
        23.4028373,
        113.316733,
        12560.480867154834,
        196.85039370078738,
        50
      ],
      [
        "01L",
        "19R",
        23.3806484,
        113.2752764,
        23.4105235,
        113.2833445,
        11241.250394513627,
        147.63779527559055,
        50
      ],
      [
        "03",
        "21",
        23.3547931,
        113.3192126,
        23.3864914,
        113.3277609,
        11926.29358768402,
        147.63779527559055,
        50
      ]
    ]
  },
  "KATL": {
    "airport": {
      "icao": "KATL",
      "iata": "ATL",
      "name": "Hartsfield Jackson Atlanta International Airport",
      "latitude": 33.6367,
      "longitude": -84.428101,
      "elevation": 1026,
      "type": "normal"
    },
    "provenance": {
      "airportCode": "KATL",
      "endpoint": "https://overpass-api.de/api/interpreter",
      "query": "[out:json][timeout:55];(nwr[\"aeroway\"=\"aerodrome\"][\"icao\"=\"KATL\"](33.605,-84.46,33.665,-84.39);nwr[\"aeroway\"](33.605,-84.46,33.665,-84.39););out geom;",
      "fetchedAt": "2026-10-19T12:00:31.586Z",
      "licence": "ODbL-1.0",
      "attribution": "© OpenStreetMap contributors",
      "sourceTimestamp": "2026-10-19T11:58:58Z",
      "sourceFile": "sources/KATL.osm.json",
      "copyright": "https://www.openstreetmap.org/copyright"
    },
    "runways": [
      [
        "09R",
        "27L",
        33.6318132,
        -84.4479678,
        33.6318255,
        -84.4184051,
        8989.206791203882,
        150,
        1026
      ],
      [
        "09L",
        "27R",
        33.634711,
        -84.4479795,
        33.6347099,
        -84.4089297,
        11873.972395071934,
        150,
        1026
      ],
      [
        "08L",
        "26R",
        33.6495406,
        -84.4390323,
        33.6495486,
        -84.4094603,
        8992.034018161752,
        150,
        1026
      ],
      [
        "08R",
        "26L",
        33.6467936,
        -84.4383683,
        33.6468016,
        -84.4055153,
        9989.69601783201,
        150,
        1026
      ],
      [
        "10",
        "28",
        33.6202798,
        -84.4478221,
        33.6202844,
        -84.4183223,
        8970.079662462465,
        150,
        1026
      ]
    ]
  },
  "EGLL": {
    "airport": {
      "icao": "EGLL",
      "iata": "LHR",
      "name": "London Heathrow Airport",
      "latitude": 51.470748,
      "longitude": -0.459909,
      "elevation": 83,
      "type": "normal"
    },
    "provenance": {
      "airportCode": "EGLL",
      "endpoint": "https://overpass-api.de/api/interpreter",
      "query": "[out:json][timeout:55];(nwr[\"aeroway\"=\"aerodrome\"][\"icao\"=\"EGLL\"](51.445,-0.505,51.49,-0.415);nwr[\"aeroway\"](51.445,-0.505,51.49,-0.415););out geom;",
      "fetchedAt": "2026-10-19T12:01:18.511Z",
      "licence": "ODbL-1.0",
      "attribution": "© OpenStreetMap contributors",
      "sourceTimestamp": "2026-10-19T12:00:01Z",
      "sourceFile": "sources/EGLL.osm.json",
      "copyright": "https://www.openstreetmap.org/copyright"
    },
    "runways": [
      [
        "09R",
        "27L",
        51.4647867,
        -0.4823454,
        51.4649463,
        -0.4340796,
        10980.750712275425,
        164.04199475065616,
        83
      ],
      [
        "09L",
        "27R",
        51.4775009,
        -0.4850345,
        51.4776791,
        -0.4332975,
        11770.483031287833,
        164.04199475065616,
        83
      ]
    ]
  },
  "OMDB": {
    "airport": {
      "icao": "OMDB",
      "iata": "DXB",
      "name": "Dubai International Airport",
      "latitude": 25.24979,
      "longitude": 55.370992,
      "elevation": 62,
      "type": "normal"
    },
    "provenance": {
      "airportCode": "OMDB",
      "endpoint": "https://overpass-api.de/api/interpreter",
      "query": "[out:json][timeout:55];(nwr[\"aeroway\"=\"aerodrome\"][\"icao\"=\"OMDB\"](25.22,55.325,25.285,55.415);nwr[\"aeroway\"](25.22,55.325,25.285,55.415););out geom;",
      "fetchedAt": "2026-10-19T12:02:24.553Z",
      "licence": "ODbL-1.0",
      "attribution": "© OpenStreetMap contributors",
      "sourceTimestamp": "2026-10-19T12:01:02Z",
      "sourceFile": "sources/OMDB.osm.json",
      "copyright": "https://www.openstreetmap.org/copyright"
    },
    "runways": [
      [
        "12L",
        "30R",
        25.2646315,
        55.3504159,
        25.2477035,
        55.3809094,
        11818.883393876045,
        196.85039370078738,
        62
      ],
      [
        "12R",
        "30L",
        25.2561974,
        55.3582935,
        25.2359239,
        55.3948633,
        14168.695362957813,
        196.85039370078738,
        62
      ]
    ]
  },
  "WSSS": {
    "airport": {
      "icao": "WSSS",
      "iata": "SIN",
      "name": "Singapore Changi Airport",
      "latitude": 1.35019,
      "longitude": 103.994003,
      "elevation": 22,
      "type": "normal"
    },
    "provenance": {
      "airportCode": "WSSS",
      "endpoint": "https://overpass-api.de/api/interpreter",
      "query": "[out:json][timeout:25][maxsize:67108864];(nwr[\"aeroway\"=\"aerodrome\"][\"icao\"=\"WSSS\"](1.295,103.96,1.405,104.045);nwr[\"aeroway\"](1.295,103.96,1.405,104.045););out geom;",
      "fetchedAt": "2026-10-19T12:03:39.853Z",
      "licence": "ODbL-1.0",
      "attribution": "© OpenStreetMap contributors",
      "sourceTimestamp": "2026-10-19T12:02:01Z",
      "sourceFile": "sources/WSSS.osm.json",
      "copyright": "https://www.openstreetmap.org/copyright"
    },
    "runways": [
      [
        "02C",
        "20C",
        1.3287993,
        103.9849668,
        1.3619499,
        103.9989657,
        13142.058111492512,
        196.85039370078738,
        22
      ],
      [
        "02L",
        "20R",
        1.348954,
        103.9774596,
        1.3822403,
        103.9914946,
        13192.84522812745,
        196.85039370078738,
        22
      ],
      [
        "02R",
        "20L",
        1.3223944,
        103.9998434,
        1.3561785,
        104.0141068,
        13392.771487856024,
        196.85039370078738,
        22
      ]
    ]
  },
  "ZBAA": {
    "airport": {
      "icao": "ZBAA",
      "iata": "PEK",
      "name": "Beijing Capital International Airport",
      "latitude": 40.077349,
      "longitude": 116.596702,
      "elevation": 116,
      "type": "normal"
    },
    "provenance": {
      "airportCode": "ZBAA",
      "endpoint": "https://overpass.private.coffee/api/interpreter",
      "query": "[out:json][timeout:25][maxsize:67108864];(nwr[\"aeroway\"=\"aerodrome\"][\"icao\"=\"ZBAA\"](40.035,116.54,40.12,116.64);nwr[\"aeroway\"](40.035,116.54,40.12,116.64););out geom;",
      "fetchedAt": "2026-10-19T12:09:27.197Z",
      "licence": "ODbL-1.0",
      "attribution": "© OpenStreetMap contributors",
      "sourceTimestamp": "2026-05-31T22:37:44Z",
      "sourceFile": "sources/ZBAA.osm.json",
      "copyright": "https://www.openstreetmap.org/copyright"
    },
    "runways": [
      [
        "18L",
        "36R",
        40.089469,
        116.5947729,
        40.0554562,
        116.6001269,
        12512.044087694838,
        196.85039370078738,
        116
      ],
      [
        "01",
        "19",
        40.0588706,
        116.6175833,
        40.0928638,
        116.6122697,
        12503.591253828672,
        196.85039370078738,
        116
      ],
      [
        "18R",
        "36L",
        40.1021201,
        116.569645,
        40.0734499,
        116.5741604,
        10546.780003766296,
        164.04199475065616,
        116
      ]
    ]
  }
};
