# Adobe Target Activity Generator

Adobe Target Admin API를 사용하여 HTML Offer 생성, A/B Test 액티비티 생성, 그리고 활성화까지 자동화하는 웹 기반 도구입니다.

## 기능

- ✅ Access Token 자동 발급 (Client ID/Secret 기반)
- ✅ HTML Offer 생성
- ✅ 기존 Offer 목록 조회 및 검색
- ✅ A/B Test 액티비티 생성
- ✅ 액티비티 상태 변경 (saved/archived)
- ✅ 국가별 테스트 설정
- ✅ 직관적인 웹 GUI

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정 (선택사항, 권장)

`.env.example` 파일을 참고하여 `.env` 파일을 생성하고 인증 정보를 입력하세요:

```bash
cp .env.example .env
```

`.env` 파일을 열어서 다음 정보를 입력하세요:
- `ADOBE_CLIENT_ID`: Adobe I/O Console에서 발급받은 Client ID
- `ADOBE_CLIENT_SECRET`: Adobe I/O Console에서 발급받은 Client Secret (선택사항, 보안상 매번 입력 권장)
- `ADOBE_TECHNICAL_ACCOUNT_ID`: Technical Account ID
- `ADOBE_ORGANIZATION_ID`: Organization ID
- `ADOBE_TENANT`: Adobe Target 테넌트 이름

**참고**: `.env` 파일이 있으면 웹 인터페이스에서 인증 정보가 자동으로 채워집니다. Client Secret만 입력하면 됩니다.

### 3. 서버 실행

```bash
npm start
```

또는 개발 모드 (자동 재시작):

```bash
npm run dev
```

### 4. 브라우저에서 접속

```
http://localhost:3000
```

## 사용 방법

### 1. .env 파일 설정

`.env.example` 파일을 참고하여 `.env` 파일을 생성하고 **모든 필수 정보**를 입력하세요:

```env
ADOBE_CLIENT_ID=b29080c041df4c0b80cd3fa688876f1a
ADOBE_CLIENT_SECRET=p8e-BtehYPNNjL1hcHoMYBFttlU047Z9j6H7
ADOBE_TECHNICAL_ACCOUNT_ID=CD7B21DD692E9C8D0A495E44@techacct.adobe.com
ADOBE_ORGANIZATION_ID=470D362A62188DCD0A495F88@AdobeOrg
ADOBE_TENANT=your-tenant-name  # 필수: Adobe Target 테넌트 이름
```

**중요**: 모든 인증 정보는 `.env` 파일에서만 읽어옵니다. 웹 인터페이스에는 입력 필드가 없습니다.

### 2. Access Token 발급

웹 인터페이스에서 "Access Token 발급" 버튼을 클릭하여 인증을 완료합니다.

### 3. 액티비티 생성 설정

- **테스트 국가**: 드롭다운에서 선택
- **Activity 명**: 생성할 액티비티 이름 입력
- **Activity 상태**: `saved` 또는 `archived` 선택
- **Offer 생성 방식**:
  - **새 Offer 생성**: HTML 내용을 직접 입력하여 새 Offer 생성
  - **기존 Offer 사용**: 기존 Offer 목록에서 선택

### 4. 자동화 실행

"자동화 실행" 버튼을 클릭하면 다음 순서로 자동 실행됩니다:

1. HTML Offer 생성 (또는 기존 Offer 사용)
2. A/B Test 액티비티 생성
3. 액티비티 상태 변경

## API 엔드포인트

### POST /api/auth/token
Access Token 발급

### GET /api/offers/list
Offer 목록 조회

### POST /api/offers/create
HTML Offer 생성

### POST /api/activities/create
A/B Test 액티비티 생성

### PUT /api/activities/state
액티비티 상태 변경

## 주의사항

1. **Client Secret 보안**: Client Secret은 절대 공개 저장소에 커밋하지 마세요.
2. **Tenant 정보**: 올바른 Tenant 이름을 입력해야 API 호출이 성공합니다.
3. **API 권한**: 사용하는 Adobe I/O 통합에 적절한 권한이 부여되어 있어야 합니다.
4. **CORS**: 브라우저에서 직접 Adobe API를 호출할 수 없으므로 백엔드 서버를 통해 프록시합니다.

## 문제 해결

### Access Token 발급 실패
- Client ID와 Client Secret이 올바른지 확인
- Technical Account ID와 Organization ID가 정확한지 확인
- Adobe I/O Console에서 통합이 활성화되어 있는지 확인

### Offer/Activity 생성 실패
- Access Token이 유효한지 확인
- Tenant 이름이 올바른지 확인
- API 권한이 충분한지 확인

## 라이선스

MIT
