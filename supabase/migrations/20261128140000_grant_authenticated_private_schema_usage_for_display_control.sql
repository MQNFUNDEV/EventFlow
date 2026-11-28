-- Allow signed-in operators to resolve the private-schema controller RPCs.
-- Keep the schema unexposed and retain function-level authorization checks.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.acquire_display_controller(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION private.release_display_controller() TO authenticated;
