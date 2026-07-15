; Inno Setup script - FEL POS Guatemala
; Compilar con: ISCC.exe installer\FELPOS_installer.iss

#define MyAppName "FEL POS Guatemala"
#ifndef MyAppVersion
#define MyAppVersion "0.0.0"
#endif
#define MyAppPublisher "D3xFr3N"
#define MyAppExeName "FELPOS.exe"

[Setup]
AppId={{A7F3C2E1-9B4D-4F6A-8C1E-2D5F9A3B7E41}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\FEL POS
DefaultGroupName=FEL POS
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=FELPOS_Setup
SetupIconFile=assets\felpos.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
UsePreviousAppDir=yes
CloseApplications=force

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; GroupDescription: "Accesos directos:"; Flags: unchecked
Name: "cleaninstall"; Description: "Instalacion limpia (BORRA productos, ventas y caja anteriores de esta carpeta)"; GroupDescription: "Datos:"; Flags: unchecked

[Files]
Source: "staging\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\.env.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\LEEME_INSTALACION.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\Iniciar_FELPOS.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\pre_update_backup.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\update_system_safe.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\Aplicar_actualizacion_pendiente.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\Reparar_instalacion.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\Limpiar_actualizacion_pendiente.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\Diagnostico_instalacion.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\VERSION"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\BUILD_DATE"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\install_license_helper.exe"; DestDir: "{tmp}"; DestName: "install_license_helper.exe"; Flags: dontcopy noencryption deleteafterinstall

[Dirs]
Name: "{app}\data"; Permissions: users-full
Name: "{app}\data\backups"; Permissions: users-full
Name: "{app}\update_backups"; Permissions: users-full

[Icons]
Name: "{group}\FEL POS"; Filename: "{app}\Iniciar_FELPOS.bat"; WorkingDir: "{app}"
Name: "{group}\Iniciar FEL POS"; Filename: "{app}\Iniciar_FELPOS.bat"; WorkingDir: "{app}"
Name: "{group}\Respaldo antes de actualizar"; Filename: "{app}\pre_update_backup.bat"; WorkingDir: "{app}"
Name: "{group}\Actualizar sistema (seguro)"; Filename: "{app}\update_system_safe.bat"; WorkingDir: "{app}"
Name: "{group}\Aplicar actualizacion pendiente"; Filename: "{app}\Aplicar_actualizacion_pendiente.bat"; WorkingDir: "{app}"
Name: "{group}\Reparar instalacion"; Filename: "{app}\Reparar_instalacion.bat"; WorkingDir: "{app}"
Name: "{group}\Limpiar actualizacion pendiente"; Filename: "{app}\Limpiar_actualizacion_pendiente.bat"; WorkingDir: "{app}"
Name: "{group}\Diagnostico instalacion"; Filename: "{app}\Diagnostico_instalacion.bat"; WorkingDir: "{app}"
Name: "{autodesktop}\FEL POS"; Filename: "{app}\Iniciar_FELPOS.bat"; Tasks: desktopicon; WorkingDir: "{app}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir FEL POS ahora"; Flags: nowait postinstall skipifsilent

[Code]
var
  LicensePage: TWizardPage;
  LicenseIntroLabel: TNewStaticText;
  FingerprintCaptionLabel: TNewStaticText;
  FingerprintEdit: TNewEdit;
  CopyFingerprintButton: TNewButton;
  LicenseCaptionLabel: TNewStaticText;
  LicenseEdit: TNewEdit;
  LicenseHintLabel: TNewStaticText;
  SavedLicenseKey: String;
  ProfilePage: TWizardPage;
  ProfileCombo: TNewComboBox;
  ProfileHintLabel: TNewStaticText;
  FelPage: TWizardPage;
  FelCombo: TNewComboBox;
  FelHintLabel: TNewStaticText;

function HelperExePath(): String;
begin
  Result := ExpandConstant('{tmp}\install_license_helper.exe');
end;

function WriteTextToFile(const FilePath, Content: String): Boolean;
var
  Lines: TStringList;
begin
  Lines := TStringList.Create;
  try
    Lines.Text := Content;
    Lines.SaveToFile(FilePath);
    Result := True;
  except
    Result := False;
  finally
    Lines.Free;
  end;
end;

function ReadFirstLine(const FilePath: String): String;
var
  Lines: TStringList;
begin
  Result := '';
  if not FileExists(FilePath) then
    Exit;
  Lines := TStringList.Create;
  try
    Lines.LoadFromFile(FilePath);
    if Lines.Count > 0 then
      Result := Trim(Lines[0]);
  finally
    Lines.Free;
  end;
end;

function EnsureLicenseHelper(): Boolean;
begin
  if not FileExists(HelperExePath()) then
    ExtractTemporaryFile('install_license_helper.exe');
  Result := FileExists(HelperExePath());
end;

function RunHelper(const Args: String; var ResultCode: Integer): Boolean;
var
  HelperPath, WorkDir: String;
begin
  Result := False;
  ResultCode := -1;
  if not EnsureLicenseHelper() then
    Exit;
  HelperPath := HelperExePath();
  WorkDir := ExpandConstant('{tmp}');
  { Filename must NOT be quoted in Exec; WorkingDir helps PyInstaller onefile. }
  Result := Exec(HelperPath, Args, WorkDir, SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function GetFingerprintViaPowerShell(): String;
var
  PsFile, OutFile, Cmd: String;
  ResultCode: Integer;
  Script: TStringList;
begin
  Result := '';
  PsFile := ExpandConstant('{tmp}\felpos_fingerprint.ps1');
  OutFile := ExpandConstant('{tmp}\felpos_fingerprint_ps.txt');
  Script := TStringList.Create;
  try
    Script.Add('$ErrorActionPreference = ''Stop''');
    Script.Add('$node = ([System.Net.Dns]::GetHostName()).Trim().ToLower()');
    Script.Add('$machine = $env:PROCESSOR_ARCHITECTURE.Trim().ToLower()');
    Script.Add('$guid = (Get-ItemProperty -Path ''HKLM:\SOFTWARE\Microsoft\Cryptography'' -Name MachineGuid).MachineGuid.Trim().ToLower()');
    Script.Add('$raw = ($node + ''|'' + $machine + ''|'' + $guid)');
    Script.Add('$hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($raw))');
    Script.Add('$hex = ([BitConverter]::ToString($hash) -replace ''-'', '''').ToLower()');
    Script.Add('Set-Content -Path $args[0] -Value $hex.Substring(0,16).ToUpper() -Encoding ASCII');
    Script.SaveToFile(PsFile);
  finally
    Script.Free;
  end;
  Cmd := '-NoProfile -ExecutionPolicy Bypass -File "' + PsFile + '" "' + OutFile + '"';
  if Exec('powershell.exe', Cmd, ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
      Result := ReadFirstLine(OutFile);
  end;
end;

function GetMachineFingerprint(): String;
var
  OutFile: String;
  ResultCode: Integer;
begin
  Result := 'NO-DISPONIBLE';
  OutFile := ExpandConstant('{tmp}\felpos_fingerprint.txt');
  if FileExists(OutFile) then
    DeleteFile(OutFile);

  if RunHelper('--write-fingerprint "' + OutFile + '"', ResultCode) then
  begin
    if (ResultCode = 0) then
      Result := ReadFirstLine(OutFile);
  end;

  if (Result = '') or (Result = 'NO-DISPONIBLE') then
  begin
    Result := GetFingerprintViaPowerShell();
    if Result = '' then
      Result := 'NO-DISPONIBLE';
  end;
end;

function ValidateLicenseKey(const Key: String): Boolean;
var
  KeyFile: String;
  ResultCode: Integer;
begin
  Result := False;
  KeyFile := ExpandConstant('{tmp}\felpos_license_input.txt');
  if not WriteTextToFile(KeyFile, Key) then
    Exit;
  if not RunHelper('--validate-file "' + KeyFile + '"', ResultCode) then
    Exit;
  Result := (ResultCode = 0);
end;

procedure CopyFingerprintClick(Sender: TObject);
var
  Fp, Cmd: String;
  ResultCode: Integer;
begin
  Fp := Trim(FingerprintEdit.Text);
  if (Fp = '') or (Fp = 'Calculando...') or (Fp = 'NO-DISPONIBLE') then
  begin
    MsgBox('Aun no hay un ID valido para copiar.', mbError, MB_OK);
    Exit;
  end;
  Cmd := '-NoProfile -ExecutionPolicy Bypass -Command "Set-Clipboard -Value ''' + Fp + '''"';
  if Exec('powershell.exe', Cmd, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0) then
    MsgBox('ID copiado al portapapeles:' + #13#10 + Fp, mbInformation, MB_OK)
  else
    MsgBox('No se pudo copiar automaticamente. Selecciona el ID y pulsa Ctrl+C.', mbError, MB_OK);
end;

procedure RefreshFingerprintDisplay();
var
  Fp: String;
begin
  FingerprintEdit.Text := 'Calculando...';
  CopyFingerprintButton.Enabled := False;
  WizardForm.Refresh;
  Fp := GetMachineFingerprint();
  FingerprintEdit.Text := Fp;
  if Fp = 'NO-DISPONIBLE' then
  begin
    CopyFingerprintButton.Enabled := False;
    LicenseHintLabel.Caption :=
      'No se pudo leer el ID de equipo. Aun asi intenta pegar la licencia. Si falla, ejecuta el instalador como administrador o desactiva el antivirus temporalmente.';
  end
  else
  begin
    CopyFingerprintButton.Enabled := True;
    LicenseHintLabel.Caption :=
      'Puedes copiar el ID con el boton o seleccionarlo y pulsar Ctrl+C. Pega la licencia completa (FELPOS-v1...) para continuar.';
  end;
end;

function GetSelectedBusinessProfile(): String;
begin
  case ProfileCombo.ItemIndex of
    1: Result := 'farmacia';
    2: Result := 'libreria';
    3: Result := 'ferreteria';
    4: Result := 'restaurante';
    5: Result := 'boutique';
  else
    Result := 'abarrotes';
  end;
end;

function ProfileHintText(): String;
begin
  case ProfileCombo.ItemIndex of
    1: Result := 'Interfaz para farmacias: medicamentos, stock critico y pedidos.';
    2: Result := 'Utiles escolares con campos de grado/marca y paquetes escolares.';
    3: Result := 'Ferreteria y materiales: herramientas, pinturas y conteo de almacen.';
    4: Result := 'Restaurante: menu, comandas e inventario de insumos de cocina.';
    5: Result := 'Boutique y moda: prendas con talla, marca, color y estilo.';
  else
    Result := 'Tienda general: abarrotes, minisuper y comercio de consumo diario.';
  end;
end;

procedure RefreshProfileHint(Sender: TObject);
begin
  ProfileHintLabel.Caption := ProfileHintText();
end;

procedure ApplyEnvValue(const EnvPath, EnvKey, EnvValue: String);
var
  Lines: TStringList;
  i: Integer;
  Found: Boolean;
  Line: String;
begin
  Lines := TStringList.Create;
  try
    if FileExists(EnvPath) then
      Lines.LoadFromFile(EnvPath);

    Found := False;
    for i := 0 to Lines.Count - 1 do
    begin
      Line := Trim(Lines[i]);
      if (Length(Line) > 0) and (Line[1] <> '#') and (Pos(EnvKey + '=', UpperCase(Line)) = 1) then
      begin
        Lines[i] := EnvKey + '=' + EnvValue;
        Found := True;
        Break;
      end;
    end;

    if not Found then
      Lines.Add(EnvKey + '=' + EnvValue);

    Lines.SaveToFile(EnvPath);
  finally
    Lines.Free;
  end;
end;

procedure ApplyBusinessProfileToEnv(const EnvPath: String);
begin
  ApplyEnvValue(EnvPath, 'BUSINESS_PROFILE', GetSelectedBusinessProfile());
end;

function GetSelectedFelMode(): String;
begin
  if FelCombo.ItemIndex = 1 then
    Result := 'demo'
  else
    Result := 'disabled';
end;

function FelHintText(): String;
begin
  if FelCombo.ItemIndex = 1 then
    Result := 'Incluye factura electronica FEL en modo prueba. Luego puedes activar produccion en Configuracion.'
  else
    Result := 'Solo ticket de venta POS. No genera factura electronica SAT. Puedes activar FEL despues en Configuracion.';
end;

procedure RefreshFelHint(Sender: TObject);
begin
  FelHintLabel.Caption := FelHintText();
end;

procedure ApplyFelModeToEnv(const EnvPath: String);
begin
  ApplyEnvValue(EnvPath, 'FEL_MODE', GetSelectedFelMode());
end;

function GetEnvValue(const EnvPath, EnvKey: String): String;
var
  Lines: TStringList;
  i: Integer;
  Line, Prefix: String;
begin
  Result := '';
  Lines := TStringList.Create;
  try
    if not FileExists(EnvPath) then
      Exit;

    Prefix := UpperCase(EnvKey) + '=';
    Lines.LoadFromFile(EnvPath);
    for i := 0 to Lines.Count - 1 do
    begin
      Line := Trim(Lines[i]);
      if (Length(Line) > 0) and (Line[1] <> '#') and (Pos(Prefix, UpperCase(Line)) = 1) then
      begin
        Result := Copy(Line, Length(EnvKey) + 2, Length(Line));
        Break;
      end;
    end;
  finally
    Lines.Free;
  end;
end;

procedure EnsureUpdateManifestUrl(const EnvPath: String);
begin
  if Trim(GetEnvValue(EnvPath, 'UPDATE_MANIFEST_URL')) = '' then
    ApplyEnvValue(EnvPath, 'UPDATE_MANIFEST_URL', 'https://D3xFr3N.github.io/fel-pos/latest.json');
end;

procedure InitializeWizard();
begin
  ExtractTemporaryFile('install_license_helper.exe');
  SavedLicenseKey := '';

  LicensePage := CreateCustomPage(
    wpWelcome,
    'Licencia de tienda',
    'Ingresa la clave de licencia entregada por el proveedor. Sin una licencia valida no se puede instalar FEL POS en esta computadora.'
  );

  LicenseIntroLabel := TNewStaticText.Create(LicensePage);
  LicenseIntroLabel.Parent := LicensePage.Surface;
  LicenseIntroLabel.Left := 0;
  LicenseIntroLabel.Top := 0;
  LicenseIntroLabel.Width := LicensePage.SurfaceWidth;
  LicenseIntroLabel.AutoSize := False;
  LicenseIntroLabel.WordWrap := True;
  LicenseIntroLabel.Caption :=
    'Cada tienda necesita su propia licencia firmada (FELPOS-v1...). ' +
    'Si aun no tienes clave, envia el ID de equipo al proveedor para activarla.';

  FingerprintCaptionLabel := TNewStaticText.Create(LicensePage);
  FingerprintCaptionLabel.Parent := LicensePage.Surface;
  FingerprintCaptionLabel.Left := 0;
  FingerprintCaptionLabel.Top := 56;
  FingerprintCaptionLabel.Width := LicensePage.SurfaceWidth;
  FingerprintCaptionLabel.Caption := 'ID de esta computadora:';

  FingerprintEdit := TNewEdit.Create(LicensePage);
  FingerprintEdit.Parent := LicensePage.Surface;
  FingerprintEdit.Left := 0;
  FingerprintEdit.Top := 74;
  FingerprintEdit.Width := LicensePage.SurfaceWidth - 110;
  FingerprintEdit.ReadOnly := True;
  FingerprintEdit.Text := 'Calculando...';

  CopyFingerprintButton := TNewButton.Create(LicensePage);
  CopyFingerprintButton.Parent := LicensePage.Surface;
  CopyFingerprintButton.Left := LicensePage.SurfaceWidth - 100;
  CopyFingerprintButton.Top := 72;
  CopyFingerprintButton.Width := 100;
  CopyFingerprintButton.Height := ScaleY(23);
  CopyFingerprintButton.Caption := 'Copiar ID';
  CopyFingerprintButton.Enabled := False;
  CopyFingerprintButton.OnClick := @CopyFingerprintClick;

  LicenseCaptionLabel := TNewStaticText.Create(LicensePage);
  LicenseCaptionLabel.Parent := LicensePage.Surface;
  LicenseCaptionLabel.Left := 0;
  LicenseCaptionLabel.Top := 112;
  LicenseCaptionLabel.Width := LicensePage.SurfaceWidth;
  LicenseCaptionLabel.Caption := 'Clave de licencia:';

  LicenseEdit := TNewEdit.Create(LicensePage);
  LicenseEdit.Parent := LicensePage.Surface;
  LicenseEdit.Left := 0;
  LicenseEdit.Top := 130;
  LicenseEdit.Width := LicensePage.SurfaceWidth;
  LicenseEdit.Text := '';

  LicenseHintLabel := TNewStaticText.Create(LicensePage);
  LicenseHintLabel.Parent := LicensePage.Surface;
  LicenseHintLabel.Left := 0;
  LicenseHintLabel.Top := 158;
  LicenseHintLabel.Width := LicensePage.SurfaceWidth;
  LicenseHintLabel.AutoSize := False;
  LicenseHintLabel.WordWrap := True;
  LicenseHintLabel.Caption := 'Pega la clave completa tal como te la enviaron. No podras continuar sin licencia valida.';

  ProfilePage := CreateCustomPage(
    wpSelectDir,
    'Tipo de negocio',
    'Selecciona el perfil de tu tienda. El sistema adaptara menus, textos y formularios a tu rubro. El inventario inicia vacio para que cargues tus productos desde cero. Puedes cambiarlo despues en Configuracion.'
  );

  ProfileCombo := TNewComboBox.Create(ProfilePage);
  ProfileCombo.Parent := ProfilePage.Surface;
  ProfileCombo.Left := 0;
  ProfileCombo.Top := 8;
  ProfileCombo.Width := ProfilePage.SurfaceWidth;
  ProfileCombo.Style := csDropDownList;
  ProfileCombo.Items.Add('Abarrotes - tienda general / minisuper');
  ProfileCombo.Items.Add('Farmacia - medicamentos e inventario');
  ProfileCombo.Items.Add('Libreria escolar - utiles y paquetes escolares');
  ProfileCombo.Items.Add('Ferreteria - materiales y herramientas');
  ProfileCombo.Items.Add('Restaurante - menu, comandas e insumos');
  ProfileCombo.Items.Add('Boutique - ropa, moda y accesorios');
  ProfileCombo.ItemIndex := 0;
  ProfileCombo.OnChange := @RefreshProfileHint;

  ProfileHintLabel := TNewStaticText.Create(ProfilePage);
  ProfileHintLabel.Parent := ProfilePage.Surface;
  ProfileHintLabel.Left := 0;
  ProfileHintLabel.Top := 44;
  ProfileHintLabel.Width := ProfilePage.SurfaceWidth;
  ProfileHintLabel.AutoSize := False;
  ProfileHintLabel.WordWrap := True;
  ProfileHintLabel.Caption := ProfileHintText();

  FelPage := CreateCustomPage(
    ProfilePage.ID,
    'Facturacion contable',
    'Elige si tu tienda necesita factura electronica FEL (SAT) o solo ticket de venta POS.'
  );

  FelCombo := TNewComboBox.Create(FelPage);
  FelCombo.Parent := FelPage.Surface;
  FelCombo.Left := 0;
  FelCombo.Top := 8;
  FelCombo.Width := FelPage.SurfaceWidth;
  FelCombo.Style := csDropDownList;
  FelCombo.Items.Add('Sin factura contable - solo ticket POS');
  FelCombo.Items.Add('Con factura contable FEL - modo prueba');
  FelCombo.ItemIndex := 0;
  FelCombo.OnChange := @RefreshFelHint;

  FelHintLabel := TNewStaticText.Create(FelPage);
  FelHintLabel.Parent := FelPage.Surface;
  FelHintLabel.Left := 0;
  FelHintLabel.Top := 44;
  FelHintLabel.Width := FelPage.SurfaceWidth;
  FelHintLabel.AutoSize := False;
  FelHintLabel.WordWrap := True;
  FelHintLabel.Caption := FelHintText();
end;

procedure CleanupPendingUpdateArtifacts(const AppDir: String);
begin
  if FileExists(AppDir + '\FELPOS.exe.pending') then
    DeleteFile(AppDir + '\FELPOS.exe.pending');
  if FileExists(AppDir + '\FELPOS.exe.old') then
    DeleteFile(AppDir + '\FELPOS.exe.old');
  if FileExists(AppDir + '\VERSION.pending') then
    DeleteFile(AppDir + '\VERSION.pending');
  if FileExists(AppDir + '\BUILD_DATE.pending') then
    DeleteFile(AppDir + '\BUILD_DATE.pending');
  if FileExists(AppDir + '\pending_update.json') then
    DeleteFile(AppDir + '\pending_update.json');
  if FileExists(AppDir + '\apply_pending_update.bat') then
    DeleteFile(AppDir + '\apply_pending_update.bat');
end;

procedure DeleteFileIfExists(const FilePath: String);
begin
  if FileExists(FilePath) then
    DeleteFile(FilePath);
end;

procedure WipeStoreDatabase(const AppDir: String);
begin
  { Instalacion limpia: sin catalogo, ventas ni caja. Solo se recrean usuarios al primer arranque. }
  ForceDirectories(AppDir + '\data');
  DeleteFileIfExists(AppDir + '\data\fel_pos.db');
  DeleteFileIfExists(AppDir + '\data\fel_pos.db-wal');
  DeleteFileIfExists(AppDir + '\data\fel_pos.db-shm');
  DeleteFileIfExists(AppDir + '\data\license_cache.json');
  DeleteFileIfExists(AppDir + '\fel_pos.db');
  DeleteFileIfExists(AppDir + '\fel_pos.db-wal');
  DeleteFileIfExists(AppDir + '\fel_pos.db-shm');
end;

function ShouldWipeDatabase(const FreshEnv: Boolean): Boolean;
begin
  { Solo borra datos si el usuario lo pide explicitamente.
    Equipo nuevo: no hay base de datos, arranca vacio solo.
    Equipo con productos: se conservan a menos que marque instalacion limpia. }
  Result := WizardIsTaskSelected('cleaninstall');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  DirText: String;
  KeyText: String;
begin
  Result := True;

  if CurPageID = LicensePage.ID then
  begin
    KeyText := Trim(LicenseEdit.Text);
    if KeyText = '' then
    begin
      MsgBox(
        'Debes ingresar la clave de licencia para continuar.' + #13#10 +
        'Si no la tienes, envia el ID de equipo al proveedor.',
        mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if not ValidateLicenseKey(KeyText) then
    begin
      MsgBox(
        'Licencia invalida o no autorizada.' + #13#10 +
        'Verifica que pegaste la clave completa (FELPOS-v1...) o contacta al proveedor.',
        mbError, MB_OK);
      Result := False;
      Exit;
    end;
    SavedLicenseKey := KeyText;
  end;

  if CurPageID = wpSelectDir then
  begin
    DirText := Trim(WizardForm.DirEdit.Text);
    if (Length(DirText) >= 2) and (Copy(DirText, 1, 2) = '\\') then
    begin
      MsgBox(
        'No instales FEL POS en una carpeta de red.' + #13#10 +
        'Usa una ruta local del disco, por ejemplo:' + #13#10 +
        'C:\FELPOS',
        mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = LicensePage.ID then
    RefreshFingerprintDisplay();
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvPath, ExamplePath, AppDir: String;
  FreshEnv: Boolean;
begin
  if CurStep = ssPostInstall then
  begin
    AppDir := ExpandConstant('{app}');
    EnvPath := AppDir + '\.env';
    ExamplePath := AppDir + '\.env.example';
    FreshEnv := not FileExists(EnvPath);

    CleanupPendingUpdateArtifacts(AppDir);

    if ShouldWipeDatabase(FreshEnv) then
      WipeStoreDatabase(AppDir);

    if FreshEnv and FileExists(ExamplePath) then
      CopyFile(ExamplePath, EnvPath, False);

    if FileExists(EnvPath) then
    begin
      if FreshEnv then
      begin
        ApplyBusinessProfileToEnv(EnvPath);
        ApplyFelModeToEnv(EnvPath);
      end;
      EnsureUpdateManifestUrl(EnvPath);
      if Trim(SavedLicenseKey) <> '' then
      begin
        ApplyEnvValue(EnvPath, 'STORE_LICENSE_KEY', SavedLicenseKey);
        ApplyEnvValue(EnvPath, 'LICENSE_REQUIRED_FOR_UPDATES', 'true');
      end;
    end;
  end;
end;
