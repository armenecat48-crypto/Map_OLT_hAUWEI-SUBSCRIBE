
export interface OLTData {
  ip_address: string;
  site_name: string | null;
  site_code: string | null;
  cat_office_name: string | null;
  equ_type_name: string;
  DV_lat: number | null;
  DV_long: number | null;
  enterprise_name: string;
  platform_chassis: string | number;
  power_consumption_watts: number;
  pon_port: number;
  pon_up: number;
  pon_down: number;
  cat_ids: string | number | null;
  active_service: string | null;
  count_active_catid: number;
  count_circuits: number | null;
}

export interface ProcessedOLT extends OLTData {
  id: string;
  catIdList: string[];
}
