; Inno Setup script - FEL POS Guatemala
; Compilar con: ISCC.exe installer\FELPOS_installer.iss

#define MyAppName "FEL POS Guatemala"
#ifndef MyAppVersion
#define MyAppVersion "0.0.0"
#endif
#define MyAppPublisher "FEL POS"
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
SetupIconFile=
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

[Files]
Source: "staging\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\.env.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\LEEME_INSTALACION.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\Iniciar_FELPOS.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\pre_update_backup.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\update_system_safe.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\VERSION"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\BUILD_DATE"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\data"; Permissions: users-full
Name: "{app}\data\backups"; Permissions: users-full
Name: "{app}\update_backups"; Permissions: users-full

[Icons]
Name: "{group}\FEL POS"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Iniciar FEL POS"; Filename: "{app}\Iniciar_FELPOS.bat"; WorkingDir: "{app}"
Name: "{group}\Respaldo antes de actualizar"; Filename: "{app}\pre_update_backup.bat"; WorkingDir: "{app}"
Name: "{group}\Actualizar sistema (seguro)"; Filename: "{app}\update_system_safe.bat"; WorkingDir: "{app}"
Name: "{autodesktop}\FEL POS"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; WorkingDir: "{app}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir FEL POS ahora"; Flags: nowait postinstall skipifsilent

[Code]
var
  ProfilePage: TWizardPage;
  ProfileCombo: TNewComboBox;
  ProfileHintLabel: TNewStaticText;
  FelPage: TWizardPage;
  FelCombo: TNewComboBox;
  FelHintLabel: TNewStaticText;

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

procedure InitializeWizard();
begin
  ProfilePage := CreateCustomPage(
    wpSelectDir,
    'Tipo de negocio',
    'Selecciona el perfil de tu tienda. El sistema adaptara menus, textos y formularios a tu rubro. Puedes cambiarlo despues en Configuracion.'
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

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvPath, ExamplePath: String;
  FreshEnv: Boolean;
begin
  if CurStep = ssPostInstall then
  begin
    EnvPath := ExpandConstant('{app}\.env');
    ExamplePath := ExpandConstant('{app}\.env.example');
    FreshEnv := not FileExists(EnvPath);

    if FreshEnv and FileExists(ExamplePath) then
      CopyFile(ExamplePath, EnvPath, False);

    if FileExists(EnvPath) then
    begin
      if FreshEnv then
      begin
        ApplyBusinessProfileToEnv(EnvPath);
        ApplyFelModeToEnv(EnvPath);
      end;
    end;
  end;
end;
