const express = require('express');
const dotenv = require('dotenv');

// Variables de entorno
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware fundamental para poder recibir datos en formato JSON en los POST
app.use(express.json());

// Listas locales para usar con los métodos POST
const listasUsuario = {
    favoritas: [],
    porVer: [],
    calificaciones: {}
};

// Sanitizar la entrada
const sanitizarTitulo = (titulo) => {
    if (!titulo) return "";
    return titulo
        .toLowerCase()
        .split(' ')
        .map(palabra => palabra.charAt(0).toUpperCase() + palabra.slice(1))
        .join(' ');
};

// ==========================================
// MÉTODOS GET (Búsqueda real en TVMaze)
// ==========================================

// GET 1: Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ estado: 'OK', mensaje: 'La API está corriendo al 100%' });
});

// GET 2: Búsqueda en la API de TVMaze
app.get('/api/serie', async (req, res) => {

    const nombreSerie = req.query.nombre;

    if (!nombreSerie) {
        return res.status(400).json({ 
            error: "Debes incluir el parámetro de búsqueda. Ejemplo: /api/serie?nombre=Chuck" 
        });
    }
    
    const tituloBuscado = sanitizarTitulo(nombreSerie);

    try {
        const url = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(tituloBuscado)}&embed=cast`;
        const respuesta = await fetch(url);

        if (!respuesta.ok) {
            return res.status(404).json({ error: `No encontramos información en la web para: ${tituloBuscado}` });
        }

        const data = await respuesta.json();

        // 3 actores principales
        let actoresPrincipales = [];
        if (data._embedded && data._embedded.cast) {
            actoresPrincipales = data._embedded.cast.slice(0, 3).map(actor => actor.person.name);
        }

        // Respuesta
        const datosSerie = {
            busqueda_original: req.params.nombre,
            titulo_sanitizado: tituloBuscado,
            titulo_oficial: data.name,
            actores_principales: actoresPrincipales.length > 0 ? actoresPrincipales : ["No disponible"],
            ano_inicio: data.premiered ? data.premiered.substring(0, 4) : "Desconocido",
            ano_fin: data.ended ? data.ended.substring(0, 4) : (data.status === "Running" ? "En emisión" : "Desconocido"),
            plataforma_streaming: data.network ? data.network.name : (data.webChannel ? data.webChannel.name : "Desconocido")
        };

        res.status(200).json(datosSerie);

    } catch (error) {
        res.status(500).json({ error: "Problema al conectarse a TVMaze", detalle: error.message });
    }
});

// GET 3: Ver el estado completo de todas las listas locales
app.get('/api/listas', (req, res) => {
    
    res.status(200).json({
        mensaje: "Estado actual de tus listas",
        listas: listasUsuario
    });
}); 

// ==========================================
// MÉTODOS POST (Usando listas locales)
// ==========================================

// POST 1: Agregar serie a "Favoritas"
app.post('/api/favoritas', (req, res) => {
    const titulo = sanitizarTitulo(req.body.titulo);

    if (!titulo) return res.status(400).json({ error: "Debes enviar un 'titulo'." });
    if (listasUsuario.favoritas.includes(titulo)) {
        return res.status(400).json({ error: "La serie ya está en tu lista de favoritas." });
    }

    listasUsuario.favoritas.push(titulo);
    res.status(201).json({ mensaje: "Agregada a favoritas", favoritas: listasUsuario.favoritas });
});

// POST 2: Agregar serie a "Por Ver"
app.post('/api/por-ver', (req, res) => {
    const titulo = sanitizarTitulo(req.body.titulo);

    if (!titulo) return res.status(400).json({ error: "Debes enviar un 'titulo'." });
    if (listasUsuario.porVer.includes(titulo)) {
        return res.status(400).json({ error: "La serie ya está en tu lista de pendientes." });
    }

    listasUsuario.porVer.push(titulo);
    res.status(201).json({ mensaje: "Agregada a lista por ver", por_ver: listasUsuario.porVer });
});

// POST 3: Calificar una serie
app.post('/api/calificar', (req, res) => {
    const titulo = sanitizarTitulo(req.body.titulo);
    const puntuacion = req.body.puntuacion;

    if (!titulo || typeof puntuacion !== 'number' || puntuacion < 1 || puntuacion > 10) {
        return res.status(400).json({ error: "Debes enviar un 'titulo' y una 'puntuacion' válida (1-10)." });
    }

    // Si la serie no tiene calificaciones aún, inicializamos su arreglo
    if (!listasUsuario.calificaciones[titulo]) {
        listasUsuario.calificaciones[titulo] = [];
    }

    listasUsuario.calificaciones[titulo].push(puntuacion);
    res.status(201).json({
        mensaje: `Has calificado '${titulo}' con un ${puntuacion}.`,
        todas_las_calificaciones: listasUsuario.calificaciones[titulo]
    });
});

// ==========================================
// MÉTODOS PUT (Reemplazar todo)
// ==========================================
// PUT 1: Reemplazar TODA la lista de favoritas
app.put('/api/favoritas', (req, res) => {
    const { nuevasFavoritas } = req.body;
    if (!Array.isArray(nuevasFavoritas)) return res.status(400).json({ error: "Envía un arreglo 'nuevasFavoritas'." });
    
    listasUsuario.favoritas = nuevasFavoritas.map(sanitizarTitulo);
    res.status(200).json({ mensaje: "Lista de favoritas reemplazada", favoritas: listasUsuario.favoritas });
});

// PUT 2: Reemplazar TODA la lista de por ver
app.put('/api/por-ver', (req, res) => {
    const { nuevaListaPorVer } = req.body;
    if (!Array.isArray(nuevaListaPorVer)) return res.status(400).json({ error: "Envía un arreglo 'nuevaListaPorVer'." });
    
    listasUsuario.porVer = nuevaListaPorVer.map(sanitizarTitulo);
    res.status(200).json({ mensaje: "Lista por ver reemplazada", por_ver: listasUsuario.porVer });
});

// ==========================================
// MÉTODOS PATCH (Modificación parcial)
// ==========================================

// PATCH 1: Corregir el nombre de una serie en favoritas (ej: si lo escribiste mal)
app.patch('/api/favoritas/:nombre', (req, res) => {
    const tituloViejo = sanitizarTitulo(req.params.nombre);
    const tituloNuevo = sanitizarTitulo(req.body.nuevoTitulo);
    
    const index = listasUsuario.favoritas.indexOf(tituloViejo);
    if (index === -1) return res.status(404).json({ error: "La serie no está en favoritas." });
    if (!tituloNuevo) return res.status(400).json({ error: "Envía el 'nuevoTitulo'." });

    listasUsuario.favoritas[index] = tituloNuevo;
    res.status(200).json({ mensaje: "Título actualizado", favoritas: listasUsuario.favoritas });
});

// PATCH 2: Corregir el nombre en la lista por ver
app.patch('/api/por-ver/:nombre', (req, res) => {
    const tituloViejo = sanitizarTitulo(req.params.nombre);
    const tituloNuevo = sanitizarTitulo(req.body.nuevoTitulo);
    
    const index = listasUsuario.porVer.indexOf(tituloViejo);
    if (index === -1) return res.status(404).json({ error: "La serie no está en por ver." });
    if (!tituloNuevo) return res.status(400).json({ error: "Envía el 'nuevoTitulo'." });

    listasUsuario.porVer[index] = tituloNuevo;
    res.status(200).json({ mensaje: "Título actualizado", por_ver: listasUsuario.porVer });
});

// ==========================================
// MÉTODOS DELETE (Eliminación)
// ==========================================

// DELETE 1: Eliminar una serie de favoritas
app.delete('/api/favoritas/:nombre', (req, res) => {
    const titulo = sanitizarTitulo(req.params.nombre);
    const index = listasUsuario.favoritas.indexOf(titulo);
    
    if (index === -1) return res.status(404).json({ error: "La serie no está en favoritas." });
    
    listasUsuario.favoritas.splice(index, 1);
    res.status(200).json({ mensaje: `${titulo} eliminada de favoritas`, favoritas: listasUsuario.favoritas });
});

// DELETE 2: Eliminar una serie de por ver
app.delete('/api/por-ver/:nombre', (req, res) => {
    const titulo = sanitizarTitulo(req.params.nombre);
    const index = listasUsuario.porVer.indexOf(titulo);
    
    if (index === -1) return res.status(404).json({ error: "La serie no está en por ver." });
    
    listasUsuario.porVer.splice(index, 1);
    res.status(200).json({ mensaje: `${titulo} eliminada de por ver`, por_ver: listasUsuario.porVer });
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});