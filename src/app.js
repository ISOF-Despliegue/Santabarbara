const express = require('express');
const dotenv = require('dotenv');

// Variables de entorno
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// 1. Sanitizar la entrada
const sanitizarTitulo = (titulo) => {
    return titulo
        .toLowerCase()
        .split(' ')
        .map(palabra => palabra.charAt(0).toUpperCase() + palabra.slice(1))
        .join(' ');
};

// Endpoint 1: Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ estado: 'OK', mensaje: 'La API está corriendo al 100%' });
});

// Endpoint 2: Búsqueda dinámica de la serie
app.get('/api/serie/:nombre', async (req, res) => {
    // Sanitizamos
    const tituloBuscado = sanitizarTitulo(req.params.nombre);