# Windows Code Signing — Azure Trusted Signing

iris-desktop의 Windows 빌드 산출물(`.exe`, NSIS installer)은 **Azure Trusted Signing** (구 명칭 Artifact Signing)으로 서명합니다. 클라우드에서 24시간짜리 단기 인증서를 발급받아 서명하는 방식이고, 타임스탬프를 함께 박아 24시간 이후에도 서명 유효성을 유지합니다.

## 어떻게 통합돼 있는가

`electron-builder@26.x`이 Azure Trusted Signing을 **네이티브로 지원**합니다. 기존 handoff 문서가 안내하는 `signtool /dlib /dmdf` 수동 호출 대신, PowerShell `TrustedSigning` 모듈의 `Invoke-TrustedSigning` cmdlet을 자동 설치하고 호출합니다. 같은 Azure 서비스를 사용하므로 결과 인증서/서명은 동일합니다.

흐름:

1. `pnpm release:build:win` → `scripts/build-win.mjs` 실행
2. wrapper가 필수 env 변수 확인
3. 다 있으면 `electron-builder --win`에 `--config.win.azureSignOptions.*` 인자를 동적으로 주입
4. 빠진 게 있으면 경고 출력 후 **서명 없이** 빌드 계속 (로컬 dev용)
5. electron-builder가 PowerShell 모듈을 통해 Azure에 인증·서명·타임스탬프 적용

## 필수 환경 변수

| 이름 | 설명 |
|---|---|
| `TRUSTED_SIGNING_ENDPOINT` | 예: `https://eus.codesigning.azure.net` |
| `TRUSTED_SIGNING_ACCOUNT_NAME` | Azure Trusted Signing 계정 이름 |
| `TRUSTED_SIGNING_CERT_PROFILE_NAME` | 해당 계정의 인증서 프로필 이름 |
| `AZURE_TENANT_ID` | Entra ID 테넌트 ID |
| `AZURE_CLIENT_ID` | Service Principal 앱 ID |
| `AZURE_CLIENT_SECRET` | Service Principal client secret |

선택:

| 이름 | 설명 |
|---|---|
| `TRUSTED_SIGNING_PUBLISHER_NAME` | 서명에 박을 publisher 이름. 보통은 비워두면 됨. |

## 1회성 Azure 셋업

서명 담당자가 한 번 해야 하는 작업.

1. **Service Principal 생성** — Entra ID → App Registrations → 새 앱 → Client Secret 발급. Client ID / Tenant ID / Secret을 기록.
2. **역할 할당 — 중요**
   - Trusted Signing 계정 → Access Control (IAM)
   - 위 service principal에 **`Trusted Signing Certificate Profile Signer`** 역할 부여
   - ⚠️ `Identity Verifier`와는 **다른** 역할. Signer가 없으면 서명 거부됨.

## GitHub Actions

`.github/workflows/iris-desktop-release.yml`이 위 env 변수들을 secrets로부터 주입합니다. 다음 secrets를 리포지토리에 등록:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `TRUSTED_SIGNING_ENDPOINT`
- `TRUSTED_SIGNING_ACCOUNT_NAME`
- `TRUSTED_SIGNING_CERT_PROFILE_NAME`
- `TRUSTED_SIGNING_PUBLISHER_NAME` (옵션)

빠져있으면 Windows job은 unsigned 산출물을 만들고 로그에 경고만 출력합니다 — Mac/Linux job은 영향 없음.

## 로컬에서 서명 테스트

```powershell
# .env.local에 위 7개 env 변수 채우기, 또는 셸에 직접 export
$env:TRUSTED_SIGNING_ENDPOINT = "https://eus.codesigning.azure.net"
$env:TRUSTED_SIGNING_ACCOUNT_NAME = "..."
$env:TRUSTED_SIGNING_CERT_PROFILE_NAME = "..."
$env:AZURE_TENANT_ID = "..."
$env:AZURE_CLIENT_ID = "..."
$env:AZURE_CLIENT_SECRET = "..."

pnpm release:build:win
```

서명 결과 검증:

```powershell
# Windows SDK의 signtool 사용
signtool verify /pa /v "release\Iris-Setup-<version>.exe"
```

출력에 `The signature is timestamped` 라인이 보여야 합니다 — 24시간 후에도 서명이 유효함을 의미.

## 알려진 한계

- **SmartScreen 평판은 별개.** 인증서는 "누가 만들었는지"만 증명. 다운로드가 누적되면서 평판이 쌓이기 전까지 초기 배포에는 SmartScreen 경고가 뜰 수 있음.
- **Azure Trusted Signing은 EV 인증서를 발급하지 않음.** OV와 동일한 평판 구축 과정 필요.
- **신원 검증(Identity Validation) 만료 갱신 필수.** 만료 시 인증서 갱신이 멈추고 연결된 모든 서명이 동작 중단. 만료일은 캘린더에 등록.
- **Service Principal client secret도 만료가 있음.** 갱신 주기 관리 필요.

## 트러블슈팅

- `Unable to find valid azure env field AZURE_TENANT_ID` → env 변수 누락. wrapper가 그 전에 잡지만, 우회로 직접 electron-builder를 호출한 경우 발생.
- `Authentication failed` → service principal에 `Trusted Signing Certificate Profile Signer` 역할이 안 붙어있을 가능성 큼.
- `Invoke-TrustedSigning: command not found` → 첫 실행 시 electron-builder가 PowerShell `TrustedSigning` 모듈을 자동 설치함. PSGallery 접근 가능해야 함.
- 더 자세한 로그가 필요하면 `DEBUG=electron-builder pnpm release:build:win` 으로 실행.
