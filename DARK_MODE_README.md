# Modo Oscuro - Documentación

## Implementación

El proyecto ahora incluye un **modo oscuro/claro** que puede alternarse desde el sidebar.

### Archivos Modificados/Creados:

1. **`src/app/globals.css`** - Añadido tema oscuro con variables CSS
2. **`src/app/globals.light.css`** - ✅ BACKUP del CSS original (modo claro)
3. **`src/components/ThemeProvider.tsx`** - Contexto para manejar el tema
4. **`src/app/layout.tsx`** - Envuelto con ThemeProvider
5. **`src/components/Sidebar.tsx`** - Botón de toggle añadido
6. **`public/Icons/sun.svg`** - Icono de sol
7. **`public/Icons/moon.svg`** - Icono de luna

---

## Cómo Usar

- **Cambiar tema**: Haz clic en el botón "Modo Oscuro" / "Modo Claro" en el sidebar (encima de "Cerrar Sesión")
- **Persistencia**: La preferencia se guarda en `localStorage`
- **Por defecto**: El tema se detecta automáticamente según la preferencia del sistema

---

## Cómo Volver al Modo Claro Original

Si deseas **eliminar completamente** el modo oscuro y volver a como estaba antes:

### Opción 1: Restaurar desde el backup

```powershell
# Restaurar el CSS original
Copy-Item src\app\globals.light.css src\app\globals.css -Force
```

### Opción 2: Revertir cambios manualmente

1. **Eliminar archivos creados:**
   ```powershell
   Remove-Item src\components\ThemeProvider.tsx
   Remove-Item public\Icons\sun.svg
   Remove-Item public\Icons\moon.svg
   ```

2. **Revertir `src/app/layout.tsx`:**
   - Quitar el import: `import { ThemeProvider } from "@/components/ThemeProvider";`
   - Quitar el wrapper `<ThemeProvider>` del body

3. **Revertir `src/components/Sidebar.tsx`:**
   - Quitar el import: `import { useTheme } from "@/components/ThemeProvider";`
   - Quitar la línea: `const { theme, toggleTheme } = useTheme();`
   - Eliminar el botón de "Theme Toggle" (antes del botón de logout)

4. **Restaurar `globals.css` desde el backup:**
   ```powershell
   Copy-Item src\app\globals.light.css src\app\globals.css -Force
   ```

---

## Variables de Tema

### Modo Claro (`:root`)
```css
--bg-main: #f0f2f5
--bg-card: #ffffff
--text-main: #111827
--text-muted: #6b7280
--border-color: #d1d5db
```

### Modo Oscuro (`[data-theme="dark"]`)
```css
--bg-main: #1a1a1a
--bg-card: #252525
--text-main: #e5e5e5
--text-muted: #a3a3a3
--border-color: #3a3a3a
```

---

## Notas

- El sidebar **siempre** permanece oscuro (`#0F172A`) independientemente del tema
- Los colores primarios (botones azules) se mantienen iguales en ambos modos
- Los estados Online/Offline mantienen sus colores verde/rojo en ambos temas
