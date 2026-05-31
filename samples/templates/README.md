# NetDraw Input Templates

## Files

- `interface-template.csv`
  - Main required input table.
- `routes-template.csv`
  - Optional route resource table. Use it when `route_hint` needs shortest-path expansion.
- `components-template.csv`
  - Optional component metadata table. Use it to enrich node layer, cabinet, slot, order, and display name.
- `rules-template.json`
  - Optional project rule file for routing, layout, style, and export naming.

## Interface Table

Required columns:

- `row_id`
- `src_device`
- `src_board`
- `src_port`
- `dst_device`
- `dst_board`
- `dst_port`
- `net_type`
- `medium`

Optional columns:

- `cable_id`
- `cable_type`
- `route_hint`
- `redundancy_group`
- `direction`
- `remarks`

Allowed `net_type` values:

- `AC`
- `DC`
- `COMM`
- `SIGNAL`
- `SAFETY`

`route_hint` format:

- Use `>` to connect route anchors, for example `ROUTE_A>ROUTE_B>ROUTE_C`.

## Routes Table

Required columns:

- `from_route_node`
- `to_route_node`

Optional columns:

- `cost`
- `zone`
- `from_x`
- `from_y`
- `to_x`
- `to_y`
- `capacity`

## Components Table

Required columns:

- `node_id`
- `type`

Optional columns:

- `layer`
- `cabinet`
- `slot`
- `order`
- `display_name`
- `remarks`

Typical `node_id` format:

- `device:DEVICE_A`
- `board:DEVICE_A/BOARD_A`
- `port:DEVICE_A/BOARD_A/PORT_01`

Allowed `layer` values:

- `part`
- `breakout`
- `interface`
- `control`
- `switch`
- `ipc`
- `route`
