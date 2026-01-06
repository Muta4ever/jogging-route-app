import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, Zap, List, X } from "lucide-react";

export default function App() {
  const mapRef = useRef(null);
  const map = useRef(null);
  const directionsRenderer = useRef(null);

  const [distance, setDistance] = useState(5);
  const [unit, setUnit] = useState("km");
  const [startPlace, setStartPlace] = useState(null);
  const [endPlace, setEndPlace] = useState(null);
  const [estimated, setEstimated] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [routeType, setRouteType] = useState("loop");
  const [directions, setDirections] = useState(null);
  const [showDirections, setShowDirections] = useState(false);

  useEffect(() => {
    if (!window.google) return;

    map.current = new google.maps.Map(mapRef.current, {
      center: { lat: 40.7128, lng: -74.006 },
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    });

    directionsRenderer.current = new google.maps.DirectionsRenderer({
      map: map.current,
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: "#3b82f6",
        strokeWeight: 5,
        strokeOpacity: 0.8
      }
    });

    const startInput = document.getElementById("start");
    const startAutocomplete = new google.maps.places.Autocomplete(startInput);

    startAutocomplete.addListener("place_changed", () => {
      const place = startAutocomplete.getPlace();
      if (!place.geometry) return;
      const loc = place.geometry.location;
      setStartPlace({ lat: loc.lat(), lng: loc.lng() });
      map.current.setCenter(loc);
      map.current.setZoom(14);
    });
  }, []);

  useEffect(() => {
    if (!window.google || routeType !== "point-to-point") return;

    const endInput = document.getElementById("end");
    if (!endInput) return;

    const endAutocomplete = new google.maps.places.Autocomplete(endInput);

    endAutocomplete.addListener("place_changed", () => {
      const place = endAutocomplete.getPlace();
      if (!place.geometry) return;
      const loc = place.geometry.location;
      setEndPlace({ lat: loc.lat(), lng: loc.lng() });
    });
  }, [routeType]);

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function toDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  function computeOffset(lat, lng, distanceKm, bearingDeg) {
    const R = 6371;
    const bearing = toRad(bearingDeg);

    const lat1 = toRad(lat);
    const lng1 = toRad(lng);

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distanceKm / R) +
        Math.cos(lat1) * Math.sin(distanceKm / R) * Math.cos(bearing)
    );

    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(distanceKm / R) * Math.cos(lat1),
        Math.cos(distanceKm / R) - Math.sin(lat1) * Math.sin(lat2)
      );

    return { lat: toDeg(lat2), lng: toDeg(lng2) };
  }

  async function generateRoute() {
    if (!startPlace) return alert("Please select a start location");
    if (routeType === "point-to-point" && !endPlace) {
      return alert("Please select an end location for point-to-point route");
    }

    setIsGenerating(true);
    setEstimated(null);

    const targetKm = unit === "km" ? distance : distance * 1.60934;
    const service = new google.maps.DirectionsService();

    if (routeType === "point-to-point") {
      // First, get the direct distance between points
      try {
        const directRes = await service.route({
          origin: startPlace,
          destination: endPlace,
          travelMode: google.maps.TravelMode.WALKING,
          avoidHighways: true,
        });

        const directMeters = directRes.routes[0].legs.reduce(
          (sum, leg) => sum + leg.distance.value,
          0
        );
        const directKm = directMeters / 1000;

        // If direct distance is much greater than target, just show direct route
        if (directKm > targetKm * 1.3) {
          directionsRenderer.current.setDirections(directRes);
          setDirections(directRes);
          setEstimated(
            unit === "km"
              ? directKm.toFixed(2)
              : (directKm / 1.60934).toFixed(2)
          );
        } 
        // If direct distance is close to target (within 30%), use direct route
        else if (directKm >= targetKm * 0.7 && directKm <= targetKm * 1.3) {
          directionsRenderer.current.setDirections(directRes);
          setDirections(directRes);
          setEstimated(
            unit === "km"
              ? directKm.toFixed(2)
              : (directKm / 1.60934).toFixed(2)
          );
        }
        // If direct distance is less than target, add waypoints to extend the route
        else {
          let best = null;
          let bestDiff = Infinity;

          for (let i = 0; i < 10; i++) {
            // Calculate midpoint between start and end
            const midLat = (startPlace.lat + endPlace.lat) / 2;
            const midLng = (startPlace.lng + endPlace.lng) / 2;

            // Calculate how much extra distance we need
            const extraNeeded = targetKm - directKm;
            
            // Create waypoint(s) that detour to add distance
            const angle = Math.random() * 360;
            const detourDist = extraNeeded / 2;
            
            const waypoint = computeOffset(midLat, midLng, detourDist, angle);

            try {
              const res = await service.route({
                origin: startPlace,
                destination: endPlace,
                waypoints: [{ location: waypoint }],
                travelMode: google.maps.TravelMode.WALKING,
                avoidHighways: true,
              });

              const meters = res.routes[0].legs.reduce(
                (sum, leg) => sum + leg.distance.value,
                0
              );

              const km = meters / 1000;
              const diff = Math.abs(km - targetKm);

              if (diff < bestDiff) {
                bestDiff = diff;
                best = { res, km };
              }
            } catch (e) {
              console.error("Route with waypoint failed:", e);
            }
          }

          if (best) {
            directionsRenderer.current.setDirections(best.res);
            setDirections(best.res);
            setEstimated(
              unit === "km"
                ? best.km.toFixed(2)
                : (best.km / 1.60934).toFixed(2)
            );
          } else {
            // Fallback to direct route
            directionsRenderer.current.setDirections(directRes);
            setDirections(directRes);
            setEstimated(
              unit === "km"
                ? directKm.toFixed(2)
                : (directKm / 1.60934).toFixed(2)
            );
          }
        }
      } catch (e) {
        console.error("Route generation failed:", e);
        alert("Could not generate route. Please try different locations.");
      }
    } else {
      // Loop route logic - generate multiple waypoints for a true loop
      let best = null;
      let bestDiff = Infinity;

      for (let i = 0; i < 12; i++) {
        const bearing = Math.random() * 360;
        
        // Create multiple waypoints to form a more circular route
        const waypoints = [];
        const numWaypoints = 2;
        
        for (let j = 0; j < numWaypoints; j++) {
          const angle = bearing + (j * (360 / numWaypoints));
          const waypointDist = (targetKm / 3) * (0.8 + Math.random() * 0.4);
          const waypoint = computeOffset(
            startPlace.lat,
            startPlace.lng,
            waypointDist,
            angle
          );
          waypoints.push({ location: waypoint });
        }

        try {
          const res = await service.route({
            origin: startPlace,
            destination: startPlace,
            waypoints: waypoints,
            travelMode: google.maps.TravelMode.WALKING,
            avoidHighways: true,
            optimizeWaypoints: false,
          });

          const meters = res.routes[0].legs.reduce(
            (sum, leg) => sum + leg.distance.value,
            0
          );

          const km = meters / 1000;
          const diff = Math.abs(km - targetKm);

          if (diff < bestDiff) {
            bestDiff = diff;
            best = { res, km };
          }
        } catch (e) {
          console.error("Route generation failed:", e);
        }
      }

      if (best) {
        directionsRenderer.current.setDirections(best.res);
        setDirections(best.res);
        setEstimated(
          unit === "km"
            ? best.km.toFixed(2)
            : (best.km / 1.60934).toFixed(2)
        );
      } else {
        alert("Could not generate route. Please try a different location or distance.");
      }
    }

    setIsGenerating(false);
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white/95 backdrop-blur-sm shadow-lg z-10 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2.5 rounded-xl shadow-md">
              <Navigation className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Jogging Route Generator</h1>
              <p className="text-sm text-slate-500">Create custom routes for your runs</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-end mb-4">
            <div className="flex flex-col">
              <label className="text-sm font-semibold text-slate-700 mb-2">
                Route Type
              </label>
              <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setRouteType("loop")}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    routeType === "loop"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  Loop
                </button>
                <button
                  onClick={() => setRouteType("point-to-point")}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    routeType === "point-to-point"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  Point to Point
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col flex-1 min-w-[240px]">
              <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-500" />
                Start Location
              </label>
              <input
                id="start"
                placeholder="Search for a place..."
                className="border-2 border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm"
              />
            </div>

            {routeType === "point-to-point" && (
              <div className="flex flex-col flex-1 min-w-[240px]">
                <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-500" />
                  End Location
                </label>
                <input
                  id="end"
                  placeholder="Search for end place..."
                  className="border-2 border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm"
                />
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex flex-col w-32">
                <label className="text-sm font-semibold text-slate-700 mb-2">
                  Distance
                </label>
                <input
                  type="number"
                  value={distance}
                  onChange={(e) => setDistance(+e.target.value)}
                  min="1"
                  max="50"
                  step="0.5"
                  className="border-2 border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
                />
              </div>

              <div className="flex flex-col w-36">
                <label className="text-sm font-semibold text-slate-700 mb-2">
                  Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="border-2 border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm cursor-pointer"
                >
                  <option value="km">Kilometers</option>
                  <option value="mi">Miles</option>
                </select>
              </div>
            </div>

            <button
              onClick={generateRoute}
              disabled={isGenerating}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Generate Route
                </>
              )}
            </button>
          </div>

          {estimated && (
            <div className="flex gap-3 items-center">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-xl px-4 py-2.5 shadow-sm">
                <div className="bg-emerald-500 rounded-full p-1">
                  <Navigation className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-slate-700">
                  Distance: <strong className="text-emerald-700 font-bold">{estimated} {unit}</strong>
                </span>
              </div>
              
              <button
                onClick={() => setShowDirections(!showDirections)}
                className="bg-slate-600 hover:bg-slate-700 text-white font-medium px-4 py-2.5 rounded-xl shadow-md transition-all duration-200 flex items-center gap-2"
              >
                <List className="w-5 h-5" />
                {showDirections ? "Hide" : "Show"} Directions
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 relative flex">
        <div ref={mapRef} className={`h-full transition-all duration-300 ${showDirections ? 'w-2/3' : 'w-full'}`} />
        
        {showDirections && directions && (
          <div className="w-1/3 bg-white shadow-2xl overflow-y-auto border-l border-slate-200">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Navigation className="w-5 h-5 text-blue-600" />
                Turn-by-Turn Directions
              </h2>
              <button
                onClick={() => setShowDirections(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            
            <div className="p-4">
              {directions.routes[0].legs.map((leg, legIndex) => (
                <div key={legIndex} className="mb-6">
                  <div className="bg-blue-50 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                      <MapPin className="w-4 h-4" />
                      {legIndex === 0 ? "Start" : `Waypoint ${legIndex}`}
                    </div>
                    <div className="text-xs text-blue-700 mt-1">
                      Distance: {leg.distance.text} • Duration: {leg.duration.text}
                    </div>
                  </div>
                  
                  {leg.steps.map((step, stepIndex) => (
                    <div key={stepIndex} className="flex gap-3 mb-3 pb-3 border-b border-slate-100 last:border-0">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-sm">
                        {stepIndex + 1}
                      </div>
                      <div className="flex-1">
                        <div 
                          className="text-slate-800 text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: step.instructions }}
                        />
                        <div className="text-xs text-slate-500 mt-1">
                          {step.distance.text} • {step.duration.text}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              
              <div className="bg-emerald-50 rounded-lg p-4 border-2 border-emerald-200">
                <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                  <MapPin className="w-5 h-5" />
                  Destination Reached
                </div>
                <div className="text-sm text-emerald-700 mt-1">
                  Total Distance: {directions.routes[0].legs.reduce((sum, leg) => sum + leg.distance.value, 0) / 1000} km
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}