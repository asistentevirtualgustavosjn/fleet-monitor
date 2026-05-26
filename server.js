const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const vehicles = {
  'VH-001': {
    id: 'VH-001', name: 'Camión 1', color: '#185FA5',
    lat: -25.2867, lng: -57.6470, speed: 0,
    status: 'activo', lastUpdate: new Date().toISOString(),
    history: [], insideRoute: true
  },
  'VH-002': {
    id: 'VH-002', name: 'Camión 2', color: '#0F6E56',
    lat: -25.2950, lng: -57.6300, speed: 0,
    status: 'activo', lastUpdate: new Date().toISOString(),
    history: [], insideRoute: true
  }
};

const assignedRoutes = {
  'VH-001': [
    { lat: -25.270, lng: -57.660 }, { lat: -25.270, lng: -57.630 },
    { lat: -25.310, lng: -57.630 }, { lat: -25.310, lng: -57.660 }
  ],
  'VH-002': [
    { lat: -25.280, lng: -57.640 }, { lat: -25.280, lng: -57.610 },
    { lat: -25.320, lng: -57.610 }, { lat: -25.320, lng: -57.640 }
  ]
};

function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function processPosition(vehicleId, lat, lng, speed) {
  if (!vehicles[vehicleId]) return null;
  const vehicle = vehicles[vehicleId];
  vehicle.lat = parseFloat(lat);
  vehicle.lng = parseFloat(lng);
  vehicle.speed = parseFloat(speed) || 0;
  vehicle.lastUpdate = new Date().toISOString();
  vehicle.status = 'activo';
  vehicle.history.push({ lat: vehicle.lat, lng: vehicle.lng, time: vehicle.lastUpdate });
  if (vehicle.history.length > 100) vehicle.history.shift();

  const route = assignedRoutes[vehicleId];
  const wasInside = vehicle.insideRoute;
  vehicle.insideRoute = pointInPolygon(vehicle.lat, vehicle.lng, route);

  if (wasInside && !vehicle.insideRoute) {
    const alert = {
      vehicleId, vehicleName: vehicle.name, type: 'FUERA_DE_RUTA',
      message: `⚠️ ${vehicle.name} salió de su ruta asignada`,
      lat: vehicle.lat, lng: vehicle.lng, time: vehicle.lastUpdate
    };
    io.emit('alert', alert);
    console.log('ALERTA:', alert.message);
  }
  if (!wasInside && vehicle.insideRoute) {
    io.emit('alert', {
      vehicleId, vehicleName: vehicle.name, type: 'REGRESO_RUTA',
      message: `✅ ${vehicle.name} regresó a su ruta`,
      lat: vehicle.lat, lng: vehicle.lng, time: vehicle.lastUpdate
    });
  }
  io.emit('vehicleUpdate', vehicle);
  return vehicle;
}

// POST /gps — formato propio y conductor.html
app.post('/gps', (req, res) => {
  const { vehicleId, lat, lng, speed } = req.body;
  const v = processPosition(vehicleId, lat, lng, speed);
  if (!v) return res.status(404).json({ error: 'Vehículo no encontrado' });
  console.log(`[GPS] ${vehicleId} → lat:${parseFloat(lat).toFixed(5)} lng:${parseFloat(lng).toFixed(5)} vel:${speed||0}km/h`);
  res.json({ ok: true, insideRoute: v.insideRoute });
});

app.get('/api/vehicles', (req, res) => res.json(Object.values(vehicles)));
app.get('/api/routes', (req, res) => res.json(assignedRoutes));

io.on('connection', (socket) => {
  console.log('Panel conectado:', socket.id);
  socket.emit('initialState', { vehicles: Object.values(vehicles), routes: assignedRoutes });
  socket.on('disconnect', () => console.log('Panel desconectado:', socket.id));
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` SISTEMA DE FLOTA ACTIVO`);
  console.log(` Panel:       http://localhost:${PORT}`);
  console.log(` Conductor:   http://192.168.88.101:${PORT}/conductor.html`);
  console.log(`========================================`);
  console.log(` SIN SIMULADOR — Solo GPS real`);
  console.log(`========================================\n`);
});
