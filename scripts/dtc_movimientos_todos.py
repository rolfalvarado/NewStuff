#!/usr/bin/env python3
"""
Script migrado desde Selenium IDE: DTC y Movimientos - TODOS LOS SISTEMAS
Ejecuta las actualizaciones de DTC y bandeja Clay para todos los sistemas de unabase
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.firefox.options import Options
from datetime import datetime, timedelta
import time
import sys

import json
import os

# ============================================
# CONFIGURACIÓN
# ============================================
USUARIO = "soporte"
PASSWORD = "Beyo5_1**"

# Cargar sistemas desde archivo de configuración JSON
json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'systems_list.json')

try:
    with open(json_path, 'r', encoding='utf-8') as f:
        SISTEMAS = json.load(f)
    print(f"  [INFO] Configuracion cargada desde: {json_path}")
except Exception as e:
    print(f"  [ERROR] No se pudo cargar systems_list.json: {e}")
    print("  Usando lista vacía por seguridad.")
    SISTEMAS = []

# Tiempos de espera (en segundos)
ESPERA_CARGA = 20
ESPERA_DTC = 50
ESPERA_CLAY = 3


def obtener_fecha_hace_dias(dias):
    """Retorna la fecha de hace X días en formato YYYY-MM-DD"""
    fecha = datetime.now() - timedelta(days=dias)
    return fecha.strftime("%Y-%m-%d")


def obtener_fecha_hace_meses(meses):
    """Retorna la fecha de hace X meses en formato YYYY-MM-DD"""
    fecha = datetime.now()
    mes = fecha.month - meses
    año = fecha.year
    while mes <= 0:
        mes += 12
        año -= 1
    dia = min(fecha.day, 28)
    return f"{año}-{mes:02d}-{dia:02d}"


def obtener_hoy():
    """Retorna la fecha de hoy en formato YYYY-MM-DD"""
    return datetime.now().strftime("%Y-%m-%d")


def esperar_y_click(driver, by, selector, timeout=ESPERA_CARGA):
    """Espera a que un elemento sea clickeable y hace click"""
    elemento = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((by, selector))
    )
    time.sleep(0.5)
    elemento.click()
    return elemento


def esperar_y_escribir(driver, by, selector, texto, timeout=ESPERA_CARGA):
    """Espera a que un elemento esté presente y escribe texto"""
    elemento = WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, selector))
    )
    elemento.clear()
    elemento.send_keys(texto)
    return elemento


def esperar_iframe(driver, indice, timeout=ESPERA_CARGA):
    """Espera a que el iframe esté disponible y cambia a él"""
    WebDriverWait(driver, timeout).until(
        EC.frame_to_be_available_and_switch_to_it(indice)
    )


def esperar_modal_visible(driver, modal_selector, timeout=ESPERA_CARGA):
    """Espera a que un modal esté visible"""
    WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, modal_selector))
    )


def detectar_config_modal(driver, timeout=10):
    """
    Detecta cuál modal está activo y devuelve un dict con sus selectores.
    Soporta dos variantes:
      - Variante A (clásica):  #exampleModalClay   / #fecha_desde  / #fecha_hasta  / #update-clay
      - Variante B (nueva):    #exampleModalGeneral / #fecha_desdea / #fecha_hastaa / .btn-accept
    """
    # Esperar a que al menos uno de los dos modales se vuelva visible
    modales_candidatos = ["#exampleModalClay", "#exampleModalGeneral"]
    modal_activo = None
    deadline = time.time() + timeout

    while time.time() < deadline:
        for sel in modales_candidatos:
            elems = driver.find_elements(By.CSS_SELECTOR, sel)
            if elems and elems[0].is_displayed():
                modal_activo = sel
                break
        if modal_activo:
            break
        time.sleep(0.5)

    if not modal_activo:
        raise Exception(
            f"No se encontró ningún modal activo ({', '.join(modales_candidatos)}) en {timeout}s"
        )

    print(f"        [INFO] Modal detectado: {modal_activo}")

    if modal_activo == "#exampleModalClay":
        return {
            "modal":       "#exampleModalClay",
            "fecha_desde": "fecha_desde",
            "fecha_hasta": "fecha_hasta",
            "btn_update":  (By.ID, "update-clay"),
            "btn_cerrar":  "#exampleModalClay .btn-secondary",
        }
    else:  # #exampleModalGeneral
        return {
            "modal":       "#exampleModalGeneral",
            "fecha_desde": "fecha_desdea",
            "fecha_hasta": "fecha_hastaa",
            "btn_update":  (By.CSS_SELECTOR, "#exampleModalGeneral .btn-accept"),
            "btn_cerrar":  "#exampleModalGeneral .btn-secondary",
        }


def esperar_invisibilidad_loading(driver, timeout=90, fallback_sleep=0):
    """Espera a que desaparezca el loading-screen si se muestra. Si no existe, hace un fallback_sleep."""
    try:
        # Pausa mínima para que se renderice el overlay
        time.sleep(1.5)
        loading_elements = driver.find_elements(By.ID, "loading-screen")
        if loading_elements:
            print("        [INFO] Detectado elemento loading-screen, esperando invisibilidad...")
            WebDriverWait(driver, timeout).until(
                EC.invisibility_of_element_located((By.ID, "loading-screen"))
            )
            print("        ✓ El loading-screen ha desaparecido")
        else:
            if fallback_sleep > 0:
                print(f"        [INFO] No se detectó loading-screen. Esperando fallback de {fallback_sleep} segundos...")
                time.sleep(fallback_sleep)
    except Exception as e:
        print(f"        [WARN] Error esperando loading-screen: {e}")
        if fallback_sleep > 0:
            time.sleep(fallback_sleep)


def buscar_con_fallback(driver, selectores, timeout=ESPERA_CARGA, descripcion="elemento"):
    """
    Intenta encontrar un elemento usando múltiples selectores.
    Retorna el primer elemento encontrado o lanza excepción si ninguno funciona.
    
    selectores: lista de tuplas (By.XXX, "selector")
    """
    last_error = None
    
    for by, selector in selectores:
        try:
            elemento = WebDriverWait(driver, timeout).until(
                EC.element_to_be_clickable((by, selector))
            )
            print(f"        ✓ Encontrado {descripcion} con: {selector[:50]}...")
            time.sleep(0.5)
            return elemento
        except Exception as e:
            last_error = e
            continue
    
    raise Exception(f"No se encontró {descripcion} con ninguno de los {len(selectores)} selectores probados. Último error: {last_error}")


def procesar_sistema(driver, sistema):
    """Procesa un sistema individual: login, DTC y bandeja Clay"""
    nombre = sistema["nombre"]
    url = sistema["url"]
    
    print(f"\n{'='*60}")
    print(f"  PROCESANDO: {nombre}")
    print(f"  URL: {url}")
    print(f"{'='*60}")
    
    try:
        # ========================================
        # PASO 1: Login
        # ========================================
        print(f"\n  [1/4] Iniciando sesión en {nombre}...")
        driver.get(url)
        time.sleep(2)
        
        esperar_y_click(driver, By.NAME, "txtUsuario")
        esperar_y_escribir(driver, By.NAME, "txtUsuario", USUARIO)
        esperar_y_escribir(driver, By.NAME, "txtPassword", PASSWORD)
        esperar_y_click(driver, By.NAME, "enter")
        
        print("        ✓ Login exitoso")
        time.sleep(3)
        
        # ========================================
        # PASO 2: Ir a Configuración
        # ========================================
        print(f"\n  [2/4] Navegando a Configuración...")
        esperar_y_click(driver, By.LINK_TEXT, "Configuracion")
        
        print("        Esperando carga del iframe...")
        time.sleep(3)
        
        # Intentar buscar el iframe de configuración dinámicamente por URL
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        config_iframe = None
        for iframe in iframes:
            src = iframe.get_attribute("src") or ""
            if "configuracion" in src:
                config_iframe = iframe
                break
                
        if config_iframe:
            driver.switch_to.frame(config_iframe)
            print("        ✓ Cambiado al iframe de Configuración de forma dinámica")
        else:
            esperar_iframe(driver, 1)
            print("        ✓ Cambiado al iframe de Configuración por índice por defecto (1)")
            
        time.sleep(2)
        
        # ========================================
        # PASO 3: Actualizar DTC (últimos 3 días)
        # ========================================
        print(f"\n  [3/4] Actualizando DTC (últimos 3 días)...")
        
        print("        Buscando botón DTC...")
        # Selectores para diferentes versiones de la página
        selectores_dtc = [
            (By.CSS_SELECTOR, ".panel-collapse:nth-child(4) strong"),
            (By.XPATH, "//strong[contains(text(),'Actualizar DTC')]"),
            (By.XPATH, "//strong[contains(text(),'Actualizar bandeja movimientos')]"),
            (By.XPATH, "//span[contains(text(),'Actualizar DTC')]"),
            (By.XPATH, "//span[contains(text(),'Actualizar bandeja movimientos')]"),
            (By.XPATH, "//*[contains(text(),'DTC') and (contains(@class,'dropdown-item') or contains(@class,'unblock-menu'))]"),
            (By.CSS_SELECTOR, "span.unblock-menu[data-target='#exampleModalClay']"),
            (By.XPATH, "//strong[contains(text(),'DTC')]/parent::*"),
        ]
        btn_dtc = buscar_con_fallback(driver, selectores_dtc, timeout=10, descripcion="botón DTC")
        btn_dtc.click()
        
        time.sleep(2)
        cfg_dtc = detectar_config_modal(driver)
        
        fecha_desde = obtener_fecha_hace_dias(3)
        fecha_hasta = obtener_hoy()
        
        print(f"        Rango: {fecha_desde} a {fecha_hasta}")
        
        esperar_y_click(driver, By.ID, cfg_dtc["fecha_desde"])
        esperar_y_escribir(driver, By.ID, cfg_dtc["fecha_desde"], fecha_desde)
        
        esperar_y_click(driver, By.ID, cfg_dtc["fecha_hasta"])
        esperar_y_escribir(driver, By.ID, cfg_dtc["fecha_hasta"], fecha_hasta)
        
        esperar_y_click(driver, cfg_dtc["btn_update"][0], cfg_dtc["btn_update"][1])
        
        esperar_invisibilidad_loading(driver, timeout=90, fallback_sleep=ESPERA_DTC)
        
        esperar_y_click(driver, By.CSS_SELECTOR, cfg_dtc["btn_cerrar"])
        print("        ✓ DTC/Bandeja movimientos actualizada")
        time.sleep(1)
        
        # ========================================
        # PASO 4: Actualizar Bandeja Clay (último mes)
        # ========================================
        print(f"\n  [4/4] Actualizando Bandeja Clay (último mes)...")
        
        print("        Buscando botón Bandeja Clay...")
        # Selectores para diferentes versiones de la página
        selectores_bandeja = [
            (By.CSS_SELECTOR, ".panel-collapse:nth-child(3) strong"),
            (By.XPATH, "//strong[contains(text(),'Actualizar bandeja clay')]"),
            (By.XPATH, "//strong[contains(text(),'Actualizar Bandeja')]"),
            (By.XPATH, "//span[contains(text(),'Actualizar bandeja clay')]"),
            (By.XPATH, "//*[contains(text(),'bandeja clay') and (contains(@class,'dropdown-item') or contains(@class,'unblock-menu'))]"),
            (By.CSS_SELECTOR, "span.unblock-menu.dropdown-item[data-target='#exampleModalGeneral']"),
            (By.XPATH, "//strong[contains(text(),'Bandeja')]/parent::*"),
            (By.XPATH, "//i[@class='fas fa-angle-right']/following-sibling::strong[contains(text(),'Actualizar')]"),
        ]
        btn_bandeja = buscar_con_fallback(driver, selectores_bandeja, timeout=10, descripcion="botón Bandeja Clay")
        btn_bandeja.click()
        
        time.sleep(2)
        cfg_clay = detectar_config_modal(driver)
        
        fecha_desde_mes = obtener_fecha_hace_meses(1)
        
        print(f"        Rango: {fecha_desde_mes} a {fecha_hasta}")
        
        esperar_y_click(driver, By.ID, cfg_clay["fecha_desde"])
        esperar_y_escribir(driver, By.ID, cfg_clay["fecha_desde"], fecha_desde_mes)
        
        esperar_y_click(driver, By.ID, cfg_clay["fecha_hasta"])
        esperar_y_escribir(driver, By.ID, cfg_clay["fecha_hasta"], fecha_hasta)
        
        esperar_y_click(driver, cfg_clay["btn_update"][0], cfg_clay["btn_update"][1])
        
        esperar_invisibilidad_loading(driver, timeout=90, fallback_sleep=ESPERA_CLAY)
        
        print("        ✓ Bandeja Clay actualizada")
        
        # Volver al contexto principal antes del siguiente sistema
        driver.switch_to.default_content()
        
        return True, None
        
    except Exception as e:
        print(f"\n  ❌ ERROR en {nombre}: {str(e)}")
        # Capturar screenshot para debug
        # Captura de pantalla removida
        pass
        
        # Volver al contexto principal para intentar el siguiente
        try:
            driver.switch_to.default_content()
        except:
            pass
            
        return False, str(e)


def main():
    print("\n" + "=" * 70)
    print("  DTC Y MOVIMIENTOS - TODOS LOS SISTEMAS UNABASE")
    print("=" * 70)
    print(f"  Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Total sistemas a procesar: {len(SISTEMAS)}")
    print("=" * 70)
    
    # Configurar navegador Firefox
    options = Options()
    options.add_argument("--headless")
    
    # Try to find Playwright's Firefox if system Firefox is not available or preferred
    import glob
    import os
    
    # Common locations for Playwright browsers on Linux
    playwright_firefox_glob = os.path.expanduser("~/.cache/ms-playwright/firefox-*/firefox/firefox")
    found_bins = glob.glob(playwright_firefox_glob)
    
    if found_bins:
        firefox_bin = found_bins[-1] # Take the last one (likely newest)
        print(f"  Usando Firefox de Playwright: {firefox_bin}")
        options.binary_location = firefox_bin
    
    driver = webdriver.Firefox(options=options)
    driver.set_window_size(1200, 1000)
    
    # Registro de resultados
    resultados = {
        "exitosos": [],
        "fallidos": []
    }
    
    try:
        for i, sistema in enumerate(SISTEMAS, 1):
            print(f"\n\n{'#'*70}")
            print(f"  SISTEMA {i} de {len(SISTEMAS)}")
            print(f"{'#'*70}")
            
            exito, error = procesar_sistema(driver, sistema)
            
            if exito:
                resultados["exitosos"].append(sistema["nombre"])
            else:
                resultados["fallidos"].append({"nombre": sistema["nombre"], "error": error})
            
            # Pequeña pausa entre sistemas
            if i < len(SISTEMAS):
                print(f"\n  Continuando con el siguiente sistema en 2 segundos...")
                time.sleep(2)
        
    finally:
        driver.quit()
    
    # ========================================
    # RESUMEN FINAL
    # ========================================
    print("\n\n" + "=" * 70)
    print("  RESUMEN FINAL")
    print("=" * 70)
    print(f"  Finalizado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"\n  ✅ Exitosos ({len(resultados['exitosos'])}):")
    for nombre in resultados["exitosos"]:
        print(f"      - {nombre}")
    
    if resultados["fallidos"]:
        print(f"\n  ❌ Fallidos ({len(resultados['fallidos'])}):")
        for item in resultados["fallidos"]:
            print(f"      - {item['nombre']}: {item['error'][:50]}...")
    
    print("\n" + "=" * 70)
    
    # Retornar código de salida
    if resultados["fallidos"]:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    # Ensure stdout is flushed immediately for real-time streaming
    sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
    main()
