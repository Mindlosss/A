# Gastos

Aplicación de escritorio para registrar gastos personales y ver resúmenes semanales y mensuales.

## Funciones

- Registrar gastos con monto, fecha, categoría y nota; buscarlos, filtrarlos por categoría, editarlos y eliminarlos.
- Ver totales de la semana, el mes o el año, promedio diario, evolución y distribución por categoría, en barras o en línea.
- Registrar ingresos extra (bonos, ventas, aguinaldo), también con fecha futura.
- Configurar el ingreso fijo (monto por pago; mensual, quincenal o semanal) y los gastos fijos (renta, suscripciones…). Ambos se registran solos en Movimientos en su día de pago; si un mes no se pagó, se borra y queda omitido.
- Llevar el dinero actual: se declara el saldo de hoy y desde ahí se suman los ingresos y se restan los gastos registrados.
- Proyectar cuánto tendrás al cierre de cada mes con base en tu ritmo de gasto, tus gastos fijos, tus pagos y tus ingresos programados.

La versión de escritorio es una ventana de [pywebview](https://pywebview.flowrl.com/) que muestra la interfaz de React y guarda los datos en SQLite (`%USERPROFILE%\.gastos\gastos.db`) desde Python. El frontend llama al backend con `window.pywebview.api.*` (ver `app.py` y `src/data.ts`). Al abrir la interfaz con Vite en un navegador normal, usa `localStorage` para facilitar el desarrollo visual. No hay cuenta ni sincronización en la nube.

## Desarrollo

Requiere Node.js y Python 3.11+.

```powershell
npm install
pip install -r requirements.txt
```

```powershell
npm run app:dev   # ventana de escritorio con recarga en caliente (levanta Vite solo)
npm run dev       # solo la interfaz en el navegador: http://localhost:1420
npm run app       # compila el frontend y abre la app como en producción
```

Los cambios en `src/` se ven al guardar. Los cambios en `app.py` requieren cerrar y volver a abrir la ventana.

## Compilar el ejecutable

Genera un solo `Gastos.exe` que no necesita Node ni Python instalados. Requiere [PyInstaller](https://pyinstaller.org/) (solo para compilar):

```powershell
pip install pyinstaller
npm run exe
```

El ejecutable queda en `build\exe\Gastos.exe`; cópialo a donde quieras (por ejemplo, al escritorio). La carpeta `build\` se regenera en cada compilación y está en `.gitignore`.

- Usa la misma base de datos que la versión de desarrollo (`%USERPROFILE%\.gastos\gastos.db`), así que recompilar o reemplazar el `.exe` no toca tus datos. Para respaldar, copia esa carpeta.
- Necesita WebView2, que ya viene con Windows 10 y 11 actualizados.
- Como no está firmado, Windows SmartScreen puede advertir que es de un "editor desconocido": **Más información → Ejecutar de todas formas**.

El proyecto usa pywebview, Python, React, TypeScript, Vite, SQLite, Motion, NumberFlow y Sonner. La interfaz está en español y muestra importes en MXN.
