# Adobe Target Tenant 이름 확인 가이드

## Tenant란?

**Tenant(테넌트)**는 Adobe Target API를 호출할 때 사용하는 조직 식별자입니다. API URL에 포함됩니다:

```
https://mc.adobe.io/{tenant}/target/...
```

## Tenant 확인 방법

### 방법 1: Adobe Target UI에서 확인

1. Adobe Target에 로그인: https://experience.adobe.com/target
2. 브라우저 주소창의 URL을 확인하세요
3. URL에 tenant 정보가 포함되어 있을 수 있습니다

### 방법 2: Adobe I/O Console에서 확인

1. https://console.adobe.io 접속
2. 프로젝트 선택
3. API 탭에서 Adobe Target Admin API 확인
4. API 엔드포인트나 설정에서 tenant 정보 확인

### 방법 3: Organization ID 기반 추정

귀하의 Organization ID: `470D362A62188DCD0A495F88@AdobeOrg`

일반적으로 tenant는:
- Organization ID의 앞부분 (예: `470D362A62188DCD0A495F88`)
- 또는 회사명/조직명 (예: `yourcompany`)

### 방법 4: API 테스트로 확인

다음 명령어로 테스트해보세요:

```bash
curl -X GET "https://mc.adobe.io/{tenant}/target/offers/content" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Api-Key: YOUR_CLIENT_ID"
```

다양한 tenant 값을 시도해보면서 성공하는 값을 찾을 수 있습니다.

## 일반적인 Tenant 형식

- 회사명 (소문자, 하이픈 포함 가능): `your-company`
- Organization ID 앞부분: `470D362A62188DCD0A495F88`
- 숫자/문자 조합: `company123`

## 문제 해결

Tenant를 모르는 경우:
1. Adobe 계정 관리자에게 문의
2. Adobe 고객 지원에 문의
3. Organization ID를 tenant로 시도해보기
