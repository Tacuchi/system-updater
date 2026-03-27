#!/usr/bin/env python3
"""
Sistema de Actualización Simple para macOS
Script único y directo para actualizar gestores de paquetes
"""

import subprocess
import sys
import os
import logging
from datetime import datetime
from pathlib import Path


class Colors:
    """Colores para terminal"""
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'


class PackageUpdater:
    def __init__(self):
        # Configurar logging
        self.setup_logging()
        
        self.managers = {
            'Homebrew': {
                'check': 'brew --version',
                'commands': ['brew update', 'brew upgrade', 'brew cleanup']
            },
            'npm': {
                'check': 'npm --version', 
                'commands': ['npm list -g --depth=0 --outdated']
            },
            'pip': {
                'check': 'pip --version',
                'commands': ['pip install --user --upgrade pip', 'pip list --outdated --format=columns']
            },
            'conda': {
                'check': 'conda --version',
                'commands': ['conda info', 'conda env list']
            },
            'gem': {
                'check': 'gem --version',
                'commands': ['gem outdated', 'gem environment']
            },
            'macOS': {
                'check': 'softwareupdate --help',
                'commands': ['softwareupdate -l']
            }
        }
        self.available_managers = []
    
    def setup_logging(self):
        """Configura el sistema de logging similar a log4j"""
        # Crear carpeta logs si no existe
        logs_dir = Path('logs')
        logs_dir.mkdir(exist_ok=True)
        
        # Nombre del archivo de log con timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        log_file = logs_dir / f'system_updater_{timestamp}.log'
        
        # Configurar logger principal
        self.logger = logging.getLogger('SystemUpdater')
        self.logger.setLevel(logging.DEBUG)
        
        # Limpiar handlers existentes
        for handler in self.logger.handlers[:]:
            self.logger.removeHandler(handler)
        
        # Handler para archivo - todos los niveles
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        
        # Formato similar a log4j
        formatter = logging.Formatter(
            '%(asctime)s [%(levelname)-5s] %(name)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(formatter)
        
        self.logger.addHandler(file_handler)
        
        # Guardar nombre del archivo para referencia
        self.log_file_path = log_file
        
        # Log inicial
        self.logger.info("="*60)
        self.logger.info("Sistema de Actualización para macOS - INICIADO")
        self.logger.info(f"Archivo de log: {log_file}")
        self.logger.info("="*60)
    
    def check_available_managers(self):
        """Verifica qué gestores están disponibles"""
        print("Verificando gestores disponibles...")
        print()
        
        self.logger.info("Iniciando verificación de gestores de paquetes")
        
        self.available_managers = []
        for name, config in self.managers.items():
            self.logger.debug(f"Verificando {name} con comando: {config['check']}")
            
            try:
                result = subprocess.run(
                    config['check'].split(),
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if result.returncode == 0:
                    self.available_managers.append((name, config))
                    print(f"[OK] {name}")
                    self.logger.info(f"{name}: Disponible")
                    self.logger.debug(f"{name} version output: {result.stdout.strip()}")
                else:
                    print(f"[--] {name}: No disponible")
                    self.logger.warning(f"{name}: No disponible (código: {result.returncode})")
                    if result.stderr:
                        self.logger.debug(f"{name} error: {result.stderr.strip()}")
                        
            except (subprocess.TimeoutExpired, FileNotFoundError) as e:
                print(f"[--] {name}: No disponible")
                self.logger.warning(f"{name}: No disponible - {type(e).__name__}: {e}")
        
        print()
        print(f"Total disponibles: {len(self.available_managers)}")
        self.logger.info(f"Verificación completada. Gestores disponibles: {len(self.available_managers)}/{len(self.managers)}")
        
        return len(self.available_managers) > 0
    
    def list_packages_to_update(self):
        """Lista paquetes que pueden actualizarse"""
        if not self.available_managers:
            print("No hay gestores disponibles")
            self.logger.warning("No hay gestores disponibles para listar")
            return
        
        print("Gestores de paquetes disponibles:")
        print()
        
        self.logger.info("Listando gestores disponibles")
        
        for i, (name, config) in enumerate(self.available_managers, 1):
            print(f"{i}. {name}")
            if name == 'npm':
                print(f"   Comandos: {config['commands'][0]} (solo listar - seguro)")
            elif name in ['conda', 'gem']:
                print(f"   Comandos: {' -> '.join(config['commands'])} (solo consulta)")
            else:
                print(f"   Comandos: {' -> '.join(config['commands'])}")
            print()
            
            self.logger.debug(f"Gestor {i}: {name} - Comandos: {config['commands']}")
    
    def update_manager(self, name, config):
        """Actualiza un gestor específico"""
        print(f"Procesando {name}...")
        print("-" * 50)
        
        self.logger.info(f"Iniciando procesamiento de {name}")
        
        # Mensajes específicos para gestores en modo consulta
        if name == 'npm':
            print("NOTA: npm en modo consulta (para evitar errores de permisos)")
            print("Para actualizar manualmente: sudo chown -R $(whoami) ~/.nvm && npm update -g")
            self.logger.info(f"{name}: Ejecutando en modo consulta para evitar errores de permisos")
        elif name == 'conda':
            print("NOTA: conda en modo consulta (para evitar errores de términos de servicio)")
            print("Para actualizar manualmente: conda update --all")
            self.logger.info(f"{name}: Ejecutando en modo consulta para evitar errores de términos de servicio")
        elif name == 'gem':
            print("NOTA: gem en modo consulta (para evitar errores de permisos)")
            print("Para actualizar manualmente: gem update")
            self.logger.info(f"{name}: Ejecutando en modo consulta para evitar errores de permisos")
        
        commands = config['commands']
        
        for i, command in enumerate(commands, 1):
            print(f"[{i}/{len(commands)}] {command}")
            self.logger.info(f"{name}: Ejecutando comando {i}/{len(commands)}: {command}")
            
            try:
                result = subprocess.run(
                    command,
                    shell=True,
                    text=True,
                    timeout=300,
                    capture_output=True
                )
                
                # Log completo del resultado
                self.logger.debug(f"{name} comando '{command}' - código de salida: {result.returncode}")
                if result.stdout:
                    self.logger.debug(f"{name} stdout: {result.stdout}")
                if result.stderr:
                    self.logger.debug(f"{name} stderr: {result.stderr}")
                
                if result.returncode == 0:
                    print("OK")
                    self.logger.info(f"{name}: Comando completado exitosamente")
                    
                    # Mostrar output relevante pero limitado en consola
                    if result.stdout.strip():
                        output_lines = result.stdout.strip().split('\n')
                        relevant_lines = []
                        for line in output_lines:
                            line = line.strip()
                            if line and not line.startswith('#') and len(line) < 100:
                                relevant_lines.append(line)
                        
                        if relevant_lines:
                            if len(relevant_lines) > 5:
                                for line in relevant_lines[:5]:
                                    print(f"  {line}")
                                print(f"  ... ({len(relevant_lines) - 5} líneas más)")
                            else:
                                for line in relevant_lines:
                                    print(f"  {line}")
                else:
                    print(f"ERROR (código: {result.returncode})")
                    self.logger.error(f"{name}: Comando falló con código {result.returncode}")
                    self.logger.error(f"{name}: Error completo: {result.stderr}")
                    
                    # Solo mostrar sugerencia específica en consola, detalles en log
                    if name == 'npm':
                        print("  Sugerencia: sudo chown -R $(whoami) ~/.nvm")
                    elif name == 'conda':
                        print("  Sugerencia: conda update --all")
                    elif name == 'gem':
                        print("  Sugerencia: gem update --user-install")
                    
                    return False
                    
            except subprocess.TimeoutExpired:
                print("ERROR: Timeout")
                self.logger.error(f"{name}: Timeout en comando '{command}' (300 segundos)")
                return False
            except Exception as e:
                print("ERROR: Excepción inesperada")
                self.logger.error(f"{name}: Excepción en comando '{command}': {type(e).__name__}: {e}")
                return False
            
            print()
        
        print(f"{name} completado correctamente")
        self.logger.info(f"{name}: Procesamiento completado exitosamente")
        return True
    
    def update_all(self):
        """Actualiza todos los gestores disponibles"""
        if not self.available_managers:
            print("No hay gestores para procesar")
            self.logger.warning("No hay gestores disponibles para procesar")
            return
        
        print("Ejecutando verificación de todos los gestores...")
        print()
        print("NOTA: npm, conda y gem en modo consulta para evitar errores de permisos")
        print()
        
        self.logger.info("Iniciando procesamiento de todos los gestores")
        self.logger.info(f"Total de gestores a procesar: {len(self.available_managers)}")
        
        success_count = 0
        failed_managers = []
        
        for i, (name, config) in enumerate(self.available_managers, 1):
            print(f"[{i}/{len(self.available_managers)}] {name}")
            self.logger.info(f"Procesando gestor {i}/{len(self.available_managers)}: {name}")
            
            if self.update_manager(name, config):
                success_count += 1
                self.logger.info(f"{name}: Completado exitosamente")
            else:
                failed_managers.append(name)
                self.logger.error(f"{name}: Falló durante el procesamiento")
            
            print("=" * 60)
            print()
        
        print("RESUMEN:")
        print(f"Exitosos: {success_count}")
        print(f"Fallidos: {len(self.available_managers) - success_count}")
        
        self.logger.info("="*40)
        self.logger.info("RESUMEN FINAL")
        self.logger.info(f"Gestores exitosos: {success_count}")
        self.logger.info(f"Gestores fallidos: {len(self.available_managers) - success_count}")
        
        if failed_managers:
            print(f"Con errores: {', '.join(failed_managers)}")
            self.logger.error(f"Gestores con errores: {failed_managers}")
        
        print()
        print("COMANDOS MANUALES RECOMENDADOS:")
        if any(name in ['npm', 'conda', 'gem'] for name, _ in self.available_managers):
            print("Para actualizar sin errores de permisos:")
            print("  npm: sudo chown -R $(whoami) ~/.nvm && npm update -g")
            print("  conda: conda update --all")
            print("  gem: gem update --user-install")
        
        print()
        print(f"Log detallado guardado en: {self.log_file_path}")
        
        self.logger.info("Procesamiento completado")
        self.logger.info(f"Log guardado en: {self.log_file_path}")
    
    def interactive_menu(self):
        """Menú interactivo principal"""
        self.logger.info("Iniciando menú interactivo")
        
        while True:
            print("=" * 50)
            print("SISTEMA DE ACTUALIZACION PARA macOS")
            print("=" * 50)
            print()
            
            # Verificar gestores disponibles
            if not self.check_available_managers():
                print("No se encontraron gestores de paquetes disponibles.")
                self.logger.warning("No se encontraron gestores de paquetes disponibles")
                break
            
            print("Opciones:")
            print()
            print("1. Listar gestores disponibles")
            print("2. Ejecutar verificación de todos los gestores")
            print("3. Elegir gestor específico")
            print("0. Salir")
            print()
            
            try:
                choice = input("Elige una opción (0-3): ")
                print()
                
                self.logger.info(f"Usuario seleccionó opción: {choice}")
                
                if choice == '0':
                    print("Saliendo...")
                    self.logger.info("Usuario seleccionó salir")
                    break
                    
                elif choice == '1':
                    self.list_packages_to_update()
                    input("Presiona Enter para continuar...")
                    print()
                    
                elif choice == '2':
                    confirm = input("¿Ejecutar verificación de todos los gestores? (s/n): ")
                    self.logger.info(f"Usuario confirmación para procesar todos: {confirm}")
                    if confirm.lower() in ['s', 'si', 'y', 'yes']:
                        self.update_all()
                        input("Presiona Enter para continuar...")
                    print()
                    
                elif choice == '3':
                    self.choose_specific_manager()
                    
                else:
                    print("Opción inválida. Intenta de nuevo.")
                    self.logger.warning(f"Opción inválida seleccionada: {choice}")
                    print()
                    
            except KeyboardInterrupt:
                print("\nOperación cancelada.")
                self.logger.info("Operación cancelada por el usuario (Ctrl+C)")
                break
            except Exception as e:
                print("Error inesperado.")
                self.logger.error(f"Error inesperado en menú interactivo: {type(e).__name__}: {e}")
    
    def choose_specific_manager(self):
        """Permite elegir un gestor específico"""
        print("Gestores disponibles:")
        print()
        
        self.logger.info("Usuario eligiendo gestor específico")
        
        for i, (name, config) in enumerate(self.available_managers, 1):
            print(f"{i}. {name}")
        
        print("0. Volver al menú principal")
        print()
        
        try:
            choice = int(input(f"Elige un gestor (0-{len(self.available_managers)}): "))
            print()
            
            self.logger.info(f"Usuario seleccionó gestor número: {choice}")
            
            if choice == 0:
                return
            elif 1 <= choice <= len(self.available_managers):
                name, config = self.available_managers[choice - 1]
                
                self.logger.info(f"Procesando gestor específico: {name}")
                
                # Avisos específicos
                if name in ['npm', 'conda', 'gem']:
                    print(f"AVISO: {name} se ejecutará en modo consulta para evitar errores")
                    confirm = input(f"¿Continuar con {name}? (s/n): ")
                else:
                    confirm = input(f"¿Procesar {name}? (s/n): ")
                
                self.logger.info(f"Usuario confirmación para {name}: {confirm}")
                
                if confirm.lower() in ['s', 'si', 'y', 'yes']:
                    self.update_manager(name, config)
                    input("Presiona Enter para continuar...")
                print()
            else:
                print("Número inválido")
                self.logger.warning(f"Número de gestor inválido: {choice}")
                
        except ValueError:
            print("Por favor introduce un número válido")
            self.logger.warning("Usuario introdujo valor no numérico")
        except Exception as e:
            print("Error inesperado")
            self.logger.error(f"Error en selección de gestor específico: {type(e).__name__}: {e}")


def main():
    """Función principal"""
    print("Sistema de Actualización para macOS")
    print(f"Ejecutado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    try:
        updater = PackageUpdater()
        updater.interactive_menu()
    except Exception as e:
        print("Error crítico durante la ejecución")
        # Si el logger no está disponible, escribir a archivo básico
        try:
            logs_dir = Path('logs')
            logs_dir.mkdir(exist_ok=True)
            error_file = logs_dir / f'error_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
            with open(error_file, 'w', encoding='utf-8') as f:
                f.write(f"Error crítico: {type(e).__name__}: {e}\n")
            print(f"Error registrado en: {error_file}")
        except:
            print(f"Error crítico no registrable: {e}")


if __name__ == "__main__":
    main() 