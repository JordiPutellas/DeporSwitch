# DeporSwitch

DeporSwitch es una extensión de Chrome diseñada para empleados de Deporvillage. Permite cambiar rápidamente entre diferentes dominios de productos y copiar URLs de productos específicos en otros dominios.

## Características

- Captura de SKU del producto actual.
- Generación y apertura de la URL del producto en diferentes dominios.
- Copia automática de la URL del primer resultado al portapapeles.

## Tecnologías Utilizadas

- **React** con **TypeScript**
- **Vite**
- **API de Chrome**

## Instalación

### Prerrequisitos

- Node.js
- npm o yarn

### Pasos

1. Clona el repositorio:

   ```bash
   git clone https://github.com/JordiPutellas/depor-switch.git
   cd depor-switch
   ```

2. Instala las dependencias:

   ```bash
   npm install
   ```

   o

   ```bash
   yarn install
   ```

3. Compila el proyecto:

   ```bash
   npm run build
   ```

   o

   ```bash
   yarn build
   ```

4. Carga la extensión en Chrome:
   - Abre `chrome://extensions/`.
   - Activa "Modo de desarrollador".
   - Haz clic en "Cargar descomprimida" y selecciona la carpeta `dist`.

## Uso

1. Abre una página de producto en Deporvillage.
2. Haz clic en el icono de la extensión DeporSwitch.
3. Verás el SKU del producto y los botones de diferentes dominios.
4. Haz clic en un botón de dominio para generar y copiar la URL del producto en ese dominio:
   - **Clic izquierdo**: Abre la URL en una nueva pestaña en primer plano.
   - **Clic medio (ruedita)**: Abre la URL en una nueva pestaña en segundo plano.

## Contribuir

Las contribuciones son bienvenidas. Si tienes alguna sugerencia o encuentras algún problema, por favor abre un issue o envía una pull request.

## Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
