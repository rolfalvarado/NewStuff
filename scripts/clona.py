import sys
import argparse
import json
from playwright.sync_api import Playwright, sync_playwright
import time

def parse_arguments():
    parser = argparse.ArgumentParser(description='System Permission Duplicator')
    parser.add_argument('--config', type=str, help='JSON configuration string', required=True)
    return parser.parse_args()

def navegar_hasta_permisos(page, config, target_user):
    """Navegación con verificación de cambio de tabla"""
    print(f"\n[Accediendo] {config['url']}...")
    page.goto(config['url'])
    
    # Login
    try:
        page.get_by_placeholder("Usuario").fill(config['admin'])
        page.get_by_placeholder("Password").fill(config['pass'])
        page.get_by_role("button", name="Iniciar sesión").click()
    except Exception as e:
        print(f"Error en login: {e}")
        return False
    
    # Entrar a Usuarios
    print("Entrando a sección Usuarios...")
    try:
        page.get_by_role("link", name=" Usuarios").click()
    except:
        # Retry with text only incase icon font fails
        page.get_by_text("Usuarios").click()
    
    # Seleccionar al usuario exacto
    print(f"Buscando al usuario: {target_user}...")
    try:
        # Forzamos que la celda sea visible antes de clickear
        user_cell = page.get_by_role("cell", name=target_user, exact=True)
        user_cell.wait_for(state="visible", timeout=5000)
        user_cell.click()
    except Exception as e:
        print(f"Error encontrado usuario {target_user}: {e}")
        return False
    
    # Ir a pestaña permisos
    print("Haciendo clic en la pestaña de Permisos...")
    try:
        btn_permisos = page.get_by_role("link", name="Permisos")
        btn_permisos.wait_for(state="visible")
        btn_permisos.click()
    except Exception as e:
         print(f"Error entrando a permisos: {e}")
         return False
    
    # --- SOLUCIÓN AL ERROR DE TIMEOUT ---
    print("Esperando cambio de pantalla (Usuarios -> Permisos)...")
    try:
        # Buscamos el texto 'Funcion' que está en el <thead>
        page.wait_for_selector("th:has-text('Funcion')", timeout=15000)
        # page.wait_for_timeout(1500) # Reduced for headless speed, check if needed
        print("✅ Pantalla de permisos detectada correctamente.")
        return True
    except Exception:
        print("⚠️ No se detectó el encabezado 'Funcion'. Reintentando clic en Permisos...")
        try:
             btn_permisos.click()
             page.wait_for_timeout(2000)
             return True
        except:
             return False

def extraer_permisos(page):
    data = {}
    # Obtenemos solo las filas que NO tienen data-login (esas son las de permisos)
    # o simplemente confiamos en que ya cambió la pantalla
    filas = page.locator("table tbody tr").all()
    print(f"Leyendo {len(filas)} permisos...")
    
    for fila in filas:
        celdas = fila.locator("td").all()
        if len(celdas) >= 4:
            m = celdas[0].inner_text().strip()
            f = celdas[1].inner_text().strip()
            d = celdas[2].inner_text().strip()
            llave = f"{m} {f} {d}"
            
            checkbox = celdas[3].locator("input.check")
            if checkbox.count() > 0:
                data[llave] = checkbox.is_checked()
    return data

def aplicar_espejo(page, mapa_madre):
    print("\nIniciando aplicación de cambios en la web hija...")
    filas_hija = page.locator("table tbody tr").all()
    cambios = 0
    total_revisados = 0

    for fila in filas_hija:
        celdas = fila.locator("td").all()
        if len(celdas) >= 4:
            total_revisados += 1
            m = celdas[0].inner_text().strip()
            f = celdas[1].inner_text().strip()
            d = celdas[2].inner_text().strip()
            llave_h = f"{m} {f} {d}"
            
            checkbox = celdas[3].locator("input.check")
            if checkbox.count() == 0:
                continue
                
            estado_actual = checkbox.is_checked()

            if llave_h in mapa_madre:
                estado_deseado = mapa_madre[llave_h]
                if estado_actual != estado_deseado:
                    checkbox.set_checked(estado_deseado)
                    print(f"   [SYNC] {llave_h} -> {'ON' if estado_deseado else 'OFF'}")
                    cambios += 1
            elif estado_actual:
                checkbox.set_checked(False)
                print(f"   [LIMPIEZA] {llave_h} -> OFF")
                cambios += 1
    
    print(f"\n>> Resumen: {total_revisados} permisos analizados, {cambios} cambios realizados.")

def run(playwright: Playwright) -> None:
    args = parse_arguments()
    try:
        config = json.loads(args.config)
    except json.JSONDecodeError:
        print("Error: Invalid JSON configuration")
        return

    print("Configuración recibida. Iniciando navegador...")
    # Use headless=True for server environment
    browser = playwright.firefox.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # FASE 1: MADRE
        print("\n--- FASE 1: LECTURA EN WEB MADRE ---")
        if navegar_hasta_permisos(page, config["madre"], config["madre"]["target"]):
            mapa_fuente = extraer_permisos(page)
            
            # FASE 2: HIJA
            print("\n--- FASE 2: ESCRITURA EN WEB HIJA ---")
            if navegar_hasta_permisos(page, config["hija"], config["hija"]["target"]):
                aplicar_espejo(page, mapa_fuente)
            else:
                 print("Error accediendo a la web hija")
        else:
            print("Error accediendo a la web madre")

        print("\n====================================================")
        print("Sincronización finalizada.")
        print("====================================================")

    except Exception as e:
        print(f"\n❌ ERROR GLOBAL: {e}")
    finally:
        browser.close()

if __name__ == "__main__":
    # Ensure stdout is flushed immediately for real-time streaming
    sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
    with sync_playwright() as playwright:
        run(playwright)