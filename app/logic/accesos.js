const consta = require('../config/constantes')
const { getModel } = require('../config/connection')

const ordenarMenu = async(listaMenu) => {
    let menusDto = [];
    for (let i = 0; i < listaMenu.length; i++) {
        const menu = listaMenu[i];
        if (menu.visible == 1) {
            const menuDto = {
                id: menu._id,
                menuId: menu.menuId,
                relacionMenComId: menu._id,
                title: menu.nombreMnu,
                icon: menu.icon,
                padreMnu: menu.padreMnu,
                url: menu.url,
                orden: menu.ordenMnu,
                children: []
            }
            menusDto.push(menuDto)
        }
    }

    const listaMenuOrdenado = menusDto.filter(x => x.padreMnu == 0).sort(function(a, b) {
        return a.orden - b.orden;
    });

    listaMenuOrdenado.forEach(menu => {
        let listaMenuNivel1 = menusDto.filter(x => x.padreMnu == parseInt(menu.menuId)).sort(function(a, b) {
            return a.value - b.value;
        });
        menu.type = consta.ValoresTipoMenu.Item;
        if (listaMenuNivel1.length > 0) {
            menu.type = consta.ValoresTipoMenu.Collapsable;
            menu.url = '';
            listaMenuNivel1.forEach(menu2 => {
                let listaMenuNivel2 = menusDto.filter(x => x.padreMnu == parseInt(menu2.menuId)).sort(function(a, b) {
                    return a.value - b.value;
                });
                menu2.type = consta.ValoresTipoMenu.Item;
                if (listaMenuNivel2.length > 0) {
                    menu2.type = consta.ValoresTipoMenu.Collapsable;
                    menu2.url = '';
                    listaMenuNivel2.forEach(menu3 => {
                        menu3.type = consta.ValoresTipoMenu.Item;
                        let listaMenuNivel3 = menusDto.filter(x => x.padreMnu == parseInt(menu3.menuId)).sort(function(a, b) {
                            return a.value - b.value;
                        });
                        if (listaMenuNivel3.length > 0) {
                            menu3.type = consta.ValoresTipoMenu.Collapsable;
                            menu3.url = '';
                            menu3.children = listaMenuNivel3;
                        }
                    });
                }
                menu2.children = listaMenuNivel2;
            });
        }
        menu.children = listaMenuNivel1;
    });
    var menuBase = {
        id: 'Aplicaciones',
        menuId: 0,
        relacionMenComId: 0,
        title: 'Aplicaciones',
        icon: 'apps',
        padreMnu: 0,
        url: '',
        orden: 0,
        type: 'group',
        translate: "NAV.APPLICATIONS",
        children: listaMenuOrdenado
    };
    const menuFuse = [menuBase];
    return menuFuse;
}

const obtenerCompania = async(conn, companiaId) => {
    const Compania = getModel(conn, consta.SchemaName.compania);
    const compania = await Compania.findOne({ '_id': companiaId, sucursalCompania: { $elemMatch: { activo: true } }, relacionCompaniaMenu: { $elemMatch: { activo: true } } }).select("_id ruc razonSocial automatico inventario relacionCompaniaMenu sucursalCompania imagenFondo");
    return compania;
}

module.exports = {
    ordenarMenu,
    obtenerCompania
}