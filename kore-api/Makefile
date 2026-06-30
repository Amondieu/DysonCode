.PHONY: install dev test deploy clean

install:
	pip install -r requirements.txt

dev:
	uvicorn main:app --host 0.0.0.0 --port 8000 --reload

test:
	@echo "=== Testing health ==="
	curl -s http://localhost:8000/health | python -m json.tool
	@echo ""
	@echo "=== Testing verify (mock) ==="
	curl -s -X POST http://localhost:8000/v1/compliance/verify \
	  -H "Authorization: Bearer dev-test-key-local" \
	  -H "Content-Type: application/json" \
	  -d '{"question":"Is the vendor policy compliant?","answer":"The vendor policy meets all requirements.","sources":[{"id":"doc1","content":"All vendors must complete quarterly access reviews."}]}' \
	  | python -m json.tool

deploy:
	railway up

clean:
	rm -f billing_state.json
	rm -rf logs/
