-- 생일 알림 기본값을 days→minutes로 옮긴 마이그레이션(20260706001000)이 컬럼
-- DEFAULT를 갱신하지 않아 스키마(@default(1440))와 DB(DEFAULT 1)가 어긋나 있었다.
-- 데이터는 이미 1440으로 변환돼 있고 앱은 값을 항상 명시적으로 넣으므로 동작엔
-- 영향이 없으나, migrate가 매번 이 드리프트를 재생성하는 것을 막기 위해 정렬한다.
ALTER TABLE "people" ALTER COLUMN "birthday_notification_offset_minutes" SET DEFAULT 1440;
