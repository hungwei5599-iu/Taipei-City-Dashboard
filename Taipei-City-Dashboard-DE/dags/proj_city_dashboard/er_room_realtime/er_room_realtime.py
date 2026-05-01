from operators.common_pipeline import CommonDag


def _transfer(**kwargs):
    import pandas as pd
    import requests
    from sqlalchemy import create_engine
    from utils.load_stage import (
        save_dataframe_to_postgresql,
        update_lasttime_in_data_to_dataset_info,
    )
    from utils.transform_time import convert_str_to_time_format

    dag_infos = kwargs.get("dag_infos")
    ready_data_db_uri = kwargs.get("ready_data_db_uri")
    dag_id = dag_infos.get("dag_id")
    load_behavior = dag_infos.get("load_behavior")
    default_table = dag_infos.get("ready_data_default_table")

    response = requests.post(
        "https://info.nhi.gov.tw/api/inae4000/inae4001s01/SQL0002",
        json={},
        timeout=30,
    )
    response.raise_for_status()
    raw_data = pd.DataFrame(response.json()["data"])

    data = raw_data[raw_data["areA_NO_N"].isin(["01", "31"])].copy()
    data = data.rename(
        columns={
            "hosP_ID": "hosp_id",
            "hosP_NAME": "hosp_name",
            "areA_NO_N": "area_code",
            "conT_TYPE": "cont_type",
            "waiT_SEE_CNT": "wait_see",
            "waiT_BED_CNT": "wait_bed",
            "waiT_GENERAL_CNT": "wait_general",
            "waiT_ICU_CNT": "wait_icu",
            "txT_DATE": "data_time",
        }
    )

    for column in ["wait_see", "wait_bed", "wait_general", "wait_icu"]:
        data[column] = pd.to_numeric(data[column], errors="coerce").astype("Int64")

    data["data_time"] = convert_str_to_time_format(data["data_time"])

    ready_data = data[
        [
            "hosp_id",
            "hosp_name",
            "area_code",
            "cont_type",
            "wait_see",
            "wait_bed",
            "wait_general",
            "wait_icu",
            "data_time",
        ]
    ]

    engine = create_engine(ready_data_db_uri)
    save_dataframe_to_postgresql(
        engine,
        data=ready_data,
        load_behavior=load_behavior,
        default_table=default_table,
    )
    update_lasttime_in_data_to_dataset_info(
        engine, dag_id, data["data_time"].max()
    )


dag = CommonDag(proj_folder="proj_city_dashboard", dag_folder="er_room_realtime")
dag.create_dag(etl_func=_transfer)
