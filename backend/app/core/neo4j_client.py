from neo4j import GraphDatabase
from app.core.config import settings

class Neo4jClient:
    def __init__(self):
        self._driver = None
        self.is_connected = False
        self._last_failed_time = 0
        self._last_verified_time = 0

    @property
    def driver(self):
        if self._driver is None:
            self.ensure_connected()
        return self._driver

    @driver.setter
    def driver(self, val):
        self._driver = val

    def ensure_connected(self) -> bool:
        import time
        now = time.time()
        # If recently failed, fast fail without blocking (cooldown 5s)
        if not self.is_connected and (now - self._last_failed_time) < 5:
            return False

        # If recently verified as connected, fast return true
        if self.is_connected and self._driver and (now - self._last_verified_time) < 15:
            return True

        if self._driver:
            try:
                self._driver.verify_connectivity()
                self.is_connected = True
                self._last_verified_time = now
                return True
            except Exception:
                try:
                    self._driver.close()
                except Exception:
                    pass
                self._driver = None
                self.is_connected = False

        # Candidate URIs: 127.0.0.1 and settings.NEO4J_URI for instant loopback connection
        candidate_uris = []
        if settings.NEO4J_URI not in candidate_uris:
            candidate_uris.append(settings.NEO4J_URI)
        for preferred in ["bolt://127.0.0.1:7687", "bolt://localhost:7687"]:
            if preferred not in candidate_uris:
                candidate_uris.append(preferred)

        for uri in candidate_uris:
            try:
                driver = GraphDatabase.driver(
                    uri,
                    auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
                    max_connection_lifetime=120,
                    keep_alive=True,
                    connection_timeout=10.0,
                    max_connection_pool_size=20,
                    connection_acquisition_timeout=10.0
                )
                driver.verify_connectivity()
                self.driver = driver
                self.is_connected = True
                self._last_verified_time = now
                print(f"[Neo4j] Connected successfully to {uri}")
                self.init_schema()
                return True
            except Exception as e:
                print(f"[Neo4j] Attempt {uri} failed: {e}")
                try:
                    driver.close()
                except Exception:
                    pass
                continue

        self._last_failed_time = time.time()
        self.is_connected = False
        print("[Neo4j] All candidate connections failed.")
        return False

    def init_schema(self):
        if not self.is_connected or not self.driver or getattr(self, "_schema_initialized", False):
            return
        self._schema_initialized = True
        statements = [
            "CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.case_id, p.golden_id)",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (ph:Phone) REQUIRE ph.number IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (b:BankAccount) REQUIRE b.account_number IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (i:IPAddress) REQUIRE i.address IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (d:IMEI) REQUIRE d.imei_number IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (t:CellTower) REQUIRE t.tower_id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (s:SocialAccount) REQUIRE s.handle IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (a:ATM) REQUIRE a.atm_id IS UNIQUE",
            "CREATE INDEX IF NOT EXISTS FOR (n:Person) ON (n.case_id)",
            "CREATE INDEX IF NOT EXISTS FOR (n:BankAccount) ON (n.case_id)"
        ]
        try:
            with self.driver.session() as session:
                for stmt in statements:
                    try:
                        res = session.run(stmt)
                        res.consume()
                    except Exception:
                        pass
        except Exception as e:
            pass

neo4j_client = Neo4jClient()
