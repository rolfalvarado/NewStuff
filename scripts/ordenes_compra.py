import sys
import argparse
import json
import re
from playwright.sync_api import Playwright, sync_playwright, expect
import time

def parse_arguments():
    parser = argparse.ArgumentParser(description='Save Purchase Orders')
    parser.add_argument('--config', type=str, help='JSON configuration string', required=True)
    return parser.parse_args()

def run(playwright: Playwright) -> None:
    args = parse_arguments()
    try:
        config = json.loads(args.config)
    except json.JSONDecodeError:
        print("Error: Invalid JSON configuration")
        return

    credentials = config.get("credentials", {})
    orders = config.get("orders", [])

    if not orders:
        print("Error: No purchase orders provided.")
        return

    # Force utf-8 output on Windows
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding='utf-8')

    print(f"Iniciando guardado de {len(orders)} órdenes...")
    
    # Obtener URL desde la configuración
    url = credentials.get("url")
    if not url:
        print("Error: No se proporcionó una URL en la configuración.")
        return
        
    print(f"URL: {url}")

    # Use headless=True for server
    browser = playwright.firefox.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    
    try:
        # Login
        print("[Login] Conectando...")
        page.goto(url)
        
        try:
            # Login using new locators
            page.get_by_role("textbox", name="Username").click()
            page.get_by_role("textbox", name="Username").fill(credentials.get("user"))
            page.get_by_role("textbox", name="Username").press("Tab")
            page.get_by_role("textbox", name="Password").fill(credentials.get("password"))
            page.get_by_role("button", name="Iniciar sesión").click()
            print("[Login] Credenciales enviadas.")
        except Exception as e:
            print(f"[Login] Error enviando credenciales: {e}")
            return

        # Ir a Órdenes de compra
        print("[Navegación] Entrando a Órdenes de compra...")

        try:
            # New locator with space
            page.get_by_role("link", name=" Órdenes de compra").click()
            # Wait for navigation/load? Implicit wait should handle it, but we can be safe.
            page.wait_for_timeout(2000)
        except Exception as e:
             print(f"[Navegación] Error buscando el menú: {e}")
             return
        
        # Procesar cada número
        total = len(orders)
        processed_count = 0
        
        for i, numero in enumerate(orders, 1):
            try:
                # Format to remove decimals if they come from excel (e.g. 82609.0 -> 82609)
                numero_str = str(numero).split('.')[0]
                
                print(f"[{i}/{total}] Procesando orden: {numero_str}")
                
                # Buscar el número
                try:
                    page.get_by_role("searchbox", name="Buscar...").click()
                    page.get_by_role("searchbox", name="Buscar...").fill(numero_str)
                    # User's snippet does NOT show pressing Enter. Assuming auto-filter or subsequent action triggers it.
                    # Wait for filter to apply
                    page.wait_for_timeout(1500)
                except Exception as e:
                    print(f"    ✗ Error buscando orden: {e}")
                    continue

                # Click Cell
                try:
                    # Using numero_str. partial match should work if cell has leading zeros.
                    page.get_by_role("cell", name=numero_str).click()
                    
                    # Esperar a que cargue el detalle
                    page.wait_for_timeout(1000)
                except Exception as e:
                     print(f"    ✗ Error seleccionando celda para {numero_str}: {e}")
                     continue

                # Guardar
                try:
                    page.get_by_role("button", name="Guardar").click()
                    # Esperar a que se guarde
                    page.wait_for_timeout(1500)
                    print(f"    ✓ Orden {numero_str} guardada correctamente")
                    processed_count += 1
                except Exception as save_err:
                     print(f"    ✗ Error al guardar: {save_err}")
                
                # Volver
                try:
                    page.get_by_role("button", name="Volver").click()
                    page.wait_for_timeout(1000)
                except Exception as e:
                    print(f"    ⚠️ Error al volver al listado: {e}")
                
            except Exception as e:
                print(f"    ✗ Error general procesando orden {numero}: {str(e)}")
                # Intentar recuperar el estado (volver)
                try:
                    if page.get_by_role("button", name="Volver").is_visible():
                        page.get_by_role("button", name="Volver").click()
                        page.wait_for_timeout(500)
                except:
                    pass
        
        print(f"\n{'='*50}")
        print(f"Proceso completado. Guardadas: {processed_count} de {total}.")
        print(f"{'='*50}")
        
    except Exception as e:
        print(f"Error fatal: {e}")
    finally:
        context.close()
        browser.close()

if __name__ == "__main__":
    # Ensure stdout is flushed immediately for real-time streaming
    if sys.platform == "win32":
        sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
    else:
        sys.stdout.reconfigure(line_buffering=True)
        
    with sync_playwright() as playwright:
        run(playwright)
