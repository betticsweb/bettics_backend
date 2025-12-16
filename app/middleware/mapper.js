  var confIngreso = [
    {
        dest: 'AlmacenId',
        src: 'almacenId'
    },
    {
        dest: 'ProductoId',
        src: 'productoId'
    },
    {
        dest: 'DescripcionKar',
        src: 'nombreProductoIsd'
    },
    {
        dest: 'CantidadIngresoKar',
        src: 'cantidadIsd'
    },
    {
        dest: 'PrecioIngresoKar',
        src: 'montoIsd'
    },
    {
        dest: 'TotalIngresoKar',
        src: 'subTotalIsd'
    },
    {
        dest: 'FechaKar',
        src: 'fechaIsd'
    },
    {
        dest: 'UnidadBaseId',
        src: 'unidadEquivalenteId'
    },
    {
        dest: 'OrigenId',
        src: 'origenId'
    }
];

var confSalida = [
    {
        dest: 'AlmacenId',
        src: 'almacenId'
    },
    {
        dest: 'ProductoId',
        src: 'productoId'
    },
    {
        dest: 'DescripcionKar',
        src: 'nombreProductoIsd'
    },
    {
        dest: 'CantidadSalidaKar',
        src: 'cantidadIsd'
    },
    {
        dest: 'PrecioSalidaKar',
        src: 'montoIsd'
    },
    {
        dest: 'TotalSalidaKar',
        src: 'subTotalIsd'
    },
    {
        dest: 'FechaKar',
        src: 'fechaIsd'
    },
    {
        dest: 'UnidadBaseId',
        src: 'unidadEquivalenteId'
    },
    {
        dest: 'OrigenId',
        src: 'origenId'
    }
];

exports.mapIngresoKardex =  () => confIngreso

exports.mapSalidaKardex =  () => confSalida
