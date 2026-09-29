# Gastos

Aplicación de escritorio para registrar gastos personales y ver resúmenes semanales y mensuales.

## Funciones

- Registrar gastos con monto, fecha, categoría y nota.
- Consultar movimientos, buscar y filtrar por categoría, y eliminar registros.
- Ver totales de la semana y el mes, promedio diario, evolución y distribución por categoría, en barras o en línea.
- Registrar ingresos extra (bonos, ventas, aguinaldo), también con fecha futura.
- Configurar el ingreso fijo: monto por pago y cuándo llega (mensual, quincenal o semanal).
- Llevar el dinero actual: se declara el saldo de hoy y desde ahí se suman pagos e ingresos extra y se restan gastos.
- Proyectar cuánto tendrás al cierre de cada mes con base en tu ritmo de gasto, tus pagos y tus ingresos programados.
- Probar la interfaz con datos de ejemplo mediante un botón explícito.

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

El proyecto usa pywebview, Python, React, TypeScript, Vite, SQLite, Motion, NumberFlow y Sonner. La interfaz está en español y muestra importes en MXN.
