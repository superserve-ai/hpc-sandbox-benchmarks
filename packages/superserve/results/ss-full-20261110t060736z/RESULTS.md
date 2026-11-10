# Superserve full-load run `ss-full-20261110t060736z`

| Field | Value |
|---|---|
| Command | `bun run bench:superserve full` (upstream method: waves in order, suites in a wave in parallel, all replicates concurrent; peak 36 sandboxes) |
| Source | `https://github.com/superserve-ai/hpc-sandbox-benchmarks` @ `72c47fb8652a7cd6277c887047095b3c67c8d0b3` (`vorflux/superserve-provider`) |
| Template | `sandbox-benchmarks-toolchain-v8` (`d424a915-ab73-4cd2-823d-f6b9ea279354`), 4 vCPU / 8192 MiB / 40960 MiB |
| Region (probed) | GCP `us-east4` (egress IP `34.182.169.89` is in `34.182.128.0/17`, scope `us-east4`); Cloudflare edge `IAD`, country `US` |
| Guest (probed) | Intel Xeon family/model `6/143` at 2200 MHz, 4 vCPU, kernel `6.1.158`, resolver `1.1.1.1` |
| Runner | Bun 1.4.0; host name recorded locally, redacted here |
| Started (UTC) | 2026-11-10T06:07:36.779Z |
| Ended (UTC) | 2026-11-10T07:18:18.352Z |
| Leftover sandboxes swept | 0 |

## Suites

| Wave | Suite | Sandboxes | Start (UTC) | End (UTC) | Exit |
|---|---|---|---|---|---|
| synthetic-memory | memory | 3 | 06:07:37 | 06:22:49 | 0 |
| synthetic-system | cpu-node | 5 | 06:22:49 | 06:26:50 | 0 |
| synthetic-system | network | 3 | 06:22:49 | 06:27:20 | 0 |
| synthetic-system | system | 3 | 06:22:49 | 06:28:39 | 0 |
| synthetic-system | pgbench | 3 | 06:22:49 | 06:33:11 | 0 |
| synthetic-system | disk | 3 | 06:22:49 | 06:37:21 | 0 |
| realworld | realworld-better-auth | 12 | 06:37:21 | 06:52:40 | 0 |
| realworld | realworld-openclaw | 12 | 06:37:21 | 07:16:50 | 0 |
| realworld | realworld-mastra | 12 | 06:37:21 | 07:18:18 | 0 |

All 56 shards validated with no failed gaps; all 65 metrics have values.

## Values

Value = median across sandboxes of the per-sandbox p50. The 11-08 column is the earlier full-load run in
`../baseline-20261108/`. Its Mastra `test:core` had no recorded value (the task exited 1 on the live
models.dev e2e test, excluded since `fcd7043e4`); the 11-08 figure is the median vitest `Duration` from
its 12 logs and is marked `(est.)`. `usd_per_hour` is counted once per shard.

| Metric | Unit | Dir | Value | Sandboxes | 11-08 value | Change | Status |
|---|---|---|---|---|---|---|---|
| `fio_type_random_read_engine_linux_aio_direct_yes_block_size_4kb_job_count_1_disk_target_default_test_directory_iops` | IOPS | higher | 344,000 | 3 | 325,000 | +6% | measured |
| `fio_type_random_read_engine_linux_aio_direct_yes_block_size_4kb_job_count_1_disk_target_default_test_directory_mb_per_s` | MB/s | higher | 1,409 | 3 | 1,331 | +6% | measured |
| `fio_type_random_write_engine_linux_aio_direct_yes_block_size_4kb_job_count_1_disk_target_default_test_directory_iops` | IOPS | higher | 325,500 | 3 | 260,000 | +25% | measured |
| `fio_type_random_write_engine_linux_aio_direct_yes_block_size_4kb_job_count_1_disk_target_default_test_directory_mb_per_s` | MB/s | higher | 1,334 | 3 | 1,065 | +25% | measured |
| `fio_type_sequential_read_engine_linux_aio_direct_yes_block_size_1mb_job_count_1_disk_target_default_test_directory_iops` | IOPS | higher | 4,927 | 3 | 3,770 | +31% | measured |
| `fio_type_sequential_read_engine_linux_aio_direct_yes_block_size_1mb_job_count_1_disk_target_default_test_directory_mb_per_s` | MB/s | higher | 5,167 | 3 | 3,955 | +31% | measured |
| `fio_type_sequential_write_engine_linux_aio_direct_yes_block_size_1mb_job_count_1_disk_target_default_test_directory_iops` | IOPS | higher | 6,186 | 3 | 3,870 | +60% | measured |
| `fio_type_sequential_write_engine_linux_aio_direct_yes_block_size_1mb_job_count_1_disk_target_default_test_directory_mb_per_s` | MB/s | higher | 6,488 | 3 | 4,061 | +60% | measured |
| `git_seconds` | Seconds | lower | 57.81 | 3 | 65.82 | -12% | measured |
| `hardlink_bogo_ops_per_s` | bogo ops/s | higher | 10.46 | 3 | 9.89 | +6% | measured |
| `iperf_server_address_localhost_server_port_5201_duration_10_seconds_test_tcp_parallel_1` | Mbits/sec | higher | 49,869 | 3 | 47,536 | +5% | measured |
| `iperf_server_address_localhost_server_port_5201_duration_10_seconds_test_tcp_parallel_10` | Mbits/sec | higher | 56,846 | 3 | 39,198 | +45% | measured |
| `iperf_server_address_localhost_server_port_5201_duration_10_seconds_test_udp_10000mbit_objective_parallel_1` | Mbits/sec | higher | 9,999 | 3 | 9,999 | +0% | measured |
| `iperf_wan_direction_download` | Mbits/sec | higher | 1,026 | 3 | 1,269 | -19% | measured |
| `iperf_wan_direction_upload` | Mbits/sec | higher | 1,554 | 3 | 1,253 | +24% | measured |
| `network_dns_cold_docker_io_ms` | ms | lower | 8 | 3 | 12 | -33% | measured |
| `network_dns_cold_github_com_ms` | ms | lower | 12 | 3 | 8 | +50% | measured |
| `network_dns_cold_pypi_org_ms` | ms | lower | 23 | 3 | 19 | +21% | measured |
| `network_dns_cold_registry_npmjs_org_ms` | ms | lower | 11 | 3 | 11 | +0% | measured |
| `network_dns_cold_rubygems_org_ms` | ms | lower | 67 | 3 | 71 | -6% | measured |
| `network_download_node_v22_23_1_linux_x64_mbits_per_sec` | Mbits/sec | higher | 3,339 | 3 | 2,384 | +40% | measured |
| `network_https_api_github_com_total_ms` | ms | lower | 16.71 | 3 | 14.2 | +18% | measured |
| `network_https_auth_docker_io_registry_token_total_ms` | ms | lower | 29.37 | 3 | 33.43 | -12% | measured |
| `network_https_crates_io_total_ms` | ms | lower | 16.32 | 3 | 22.38 | -27% | measured |
| `network_https_files_pythonhosted_org_total_ms` | ms | lower | 15.39 | 3 | 180.7 | -91% | measured |
| `network_https_gcr_io_v2_total_ms` | ms | lower | 16.66 | 3 | 19.17 | -13% | measured |
| `network_https_ghcr_io_v2_total_ms` | ms | lower | 23.51 | 3 | 21.29 | +10% | measured |
| `network_https_github_com_total_ms` | ms | lower | 40.9 | 3 | 30.93 | +32% | measured |
| `network_https_index_crates_io_config_total_ms` | ms | lower | 12.09 | 3 | 13.99 | -14% | measured |
| `network_https_pypi_org_total_ms` | ms | lower | 16.33 | 3 | 163 | -90% | measured |
| `network_https_raw_githubusercontent_com_total_ms` | ms | lower | 12.78 | 3 | 13.49 | -5% | measured |
| `network_https_registry_npmjs_org_total_ms` | ms | lower | 21.93 | 3 | 21.98 | -0% | measured |
| `node_web_tooling_runs_per_s` | runs/s | higher | 13.43 | 5 | 13.69 | -2% | measured |
| `pgbench_scaling_factor_100_clients_50_mode_read_only` | TPS | higher | 231,970 | 3 | 187,080 | +24% | measured |
| `pgbench_scaling_factor_100_clients_50_mode_read_only_average_latency` | ms | lower | 0.2155 | 3 | 0.2675 | -19% | measured |
| `pgbench_scaling_factor_100_clients_50_mode_read_write` | TPS | higher | 19,638 | 3 | 16,377 | +20% | measured |
| `pgbench_scaling_factor_100_clients_50_mode_read_write_average_latency` | ms | lower | 2.546 | 3 | 3.061 | -17% | measured |
| `pybench_milliseconds` | Milliseconds | lower | 562 | 3 | 559.5 | +0% | measured |
| `realworld_better_auth_task_build` | Seconds | lower | 108.2 | 12 | 105.8 | +2% | measured |
| `realworld_better_auth_task_cold_install` | Seconds | lower | 58.45 | 12 | 92.26 | -37% | measured |
| `realworld_better_auth_task_git_clone` | Seconds | lower | 20.57 | 12 | 1.088 | +1790% | measured |
| `realworld_better_auth_task_lint_biome` | Seconds | lower | 5.002 | 12 | 4.966 | +1% | measured |
| `realworld_better_auth_task_lint_deps_knip` | Seconds | lower | 17.18 | 12 | 16.15 | +6% | measured |
| `realworld_better_auth_task_lint_format` | Seconds | lower | 5.359 | 12 | 4.85 | +10% | measured |
| `realworld_better_auth_task_lint_packages` | Seconds | lower | 4.337 | 12 | 4.454 | -3% | measured |
| `realworld_better_auth_task_lint_spell` | Seconds | lower | 14.64 | 12 | 13.86 | +6% | measured |
| `realworld_better_auth_task_lint_types` | Seconds | lower | 60.05 | 12 | 56.09 | +7% | measured |
| `realworld_better_auth_task_typecheck` | Seconds | lower | 83.64 | 12 | 85.54 | -2% | measured |
| `realworld_mastra_task_build_core` | Seconds | lower | 121.8 | 12 | 125.4 | -3% | measured |
| `realworld_mastra_task_cold_install` | Seconds | lower | 122.3 | 12 | 123.8 | -1% | measured |
| `realworld_mastra_task_git_clone` | Seconds | lower | 56.27 | 12 | 22.77 | +147% | measured |
| `realworld_mastra_task_lint_format` | Seconds | lower | 183 | 12 | 183 | -0% | measured |
| `realworld_mastra_task_test_core` | Seconds | lower | 1,311 | 12 | 1,308 (est.) | +0% | measured |
| `realworld_openclaw_task_cold_install` | Seconds | lower | 120.1 | 12 | 115.6 | +4% | measured |
| `realworld_openclaw_task_git_clone` | Seconds | lower | 7.962 | 12 | 4.36 | +83% | measured |
| `realworld_openclaw_task_lint_extensions_all` | Seconds | lower | 230.1 | 12 | 230.1 | -0% | measured |
| `realworld_openclaw_task_lint_oxlint` | Seconds | lower | 427.1 | 12 | 423.4 | +1% | measured |
| `realworld_openclaw_task_test_types` | Seconds | lower | 157.2 | 12 | 154.8 | +2% | measured |
| `realworld_openclaw_task_typecheck` | Seconds | lower | 27.47 | 12 | 27.04 | +2% | measured |
| `sqlite_speedtest_seconds` | Seconds | lower | 59.19 | 3 | 72.3 | -18% | measured |
| `stream_type_add` | MB/s | higher | 43,610 | 3 | 37,461 | +16% | measured |
| `stream_type_copy` | MB/s | higher | 64,190 | 3 | 55,732 | +15% | measured |
| `stream_type_scale` | MB/s | higher | 35,457 | 3 | 31,739 | +12% | measured |
| `stream_type_triad` | MB/s | higher | 44,668 | 3 | 37,184 | +20% | measured |
| `usd_per_hour` | USD/hr | lower | 0.3312 | 56 | 0.3312 | +0% | measured |

## Notes

- Memory ran alone in its own wave (upstream method). In the 11-08 run, memory ran at the same time as the
  synthetic-system suites, so part of the STREAM change is that method difference.
- `git clone` times under the 36-sandbox realworld wave vary widely between sandboxes and between runs
  (per-sandbox Mastra values in this run range from 2.4 s to 121.7 s; Better-Auth from 5.3 s to 45.6 s). Treat
  single-run changes in the `git_clone` and `cold_install` metrics as noisy.
- Shards here keep only the `superserve` provider entry; the full shards and per-suite logs stay in the
  local `data/runs/` and `data/raw/` trees, which are git-ignored.
