const zh = {
  narrative: {
    phases: {
      boarding: {
        default: {
          0: {
            title: '在 ${departure} 登机',
            content: '机舱内弥漫着航空燃油和咖啡的气味，乘客们正在放置行李。在外面，地勤人员正在为我们的出发做准备。“欢迎乘坐 ${callsign}，”乘务员通过广播宣布。${aircraft} 已经准备好前往 ${arrival} 的旅程。'
          },
          1: {
            title: '最后登机广播',
            content: '乘客们正在入座。机组人员正在进行最后的检查。机长欢迎大家登机。“我们将飞往 ${arrival}，旅途愉快。”舱门很快就要关闭了。'
          },
          2: {
            title: '飞行前检查',
            content: '驾驶舱准备工作正在进行中。检查燃油、航线和系统。“登机结束，”登机口工作人员确认。廊桥正在撤回。我们要出发了。'
          }
        },
        sunny: {
            0: {
                title: '阳光明媚的出发',
                content: '当乘客登机时，阳光透过窗户照射进来。这是飞行的好天气。“欢迎来到 ${callsign}，”机组人员热情地问候大家。'
            }
        },
        rainy: {
            0: {
                title: '雨中登机',
                content: '乘客们匆忙登机，雨水敲打着机身。“请小心脚下，”机组人员建议道。我们将在阴雨中启程前往 ${arrival}。'
            }
        },
        shakespearean: {
            0: {
                title: '舞台已就绪',
                content: '朋友们，罗马人，同胞们，请听我说！我们将踏上前往 ${arrival} 的旅程。铁鸟正在等待它的主人。'
            }
        }
      },
      departure_clearance: {
        default: {
          0: {
            title: 'IFR 放行',
            content: '无线电发出滋滋声。“${callsign}，许可前往 ${arrival}，按飞行计划航线飞行。爬升并保持 FL350。离场频率 124.7。应答机 4211。”系统上线时，你复诵了放行许可。'
          },
          1: {
            title: '抄收放行许可',
            content: '“${callsign}，准备抄收放行许可。”“许可前往 ${arrival}，保持 5000，起飞后 10 分钟预期 FL350。”笔在纸上沙沙作响。“复诵正确。”'
          },
          2: {
            title: '航线确认',
            content: '正在核实前往 ${arrival} 的航线。“收到放行许可，”副驾驶点点头。设置 FMS 并检查应答机代码。准备推出。'
          }
        },
        shakespearean: {
            0: {
                title: '获准通行',
                content: '以太之神已发话！我们要获准通往 ${arrival} 之地。让我们飞升吧！'
            }
        }
      },
      pushback: {
        default: {
          0: {
            title: '推出许可',
            content: '拖车连接时轻轻一震。“地面呼叫驾驶舱，刹车松开。”当你启动发动机时，航站楼慢慢远去。APU 的嗡嗡声被主涡轮的轰鸣声取代。'
          },
          1: {
            title: '启动发动机',
            content: '“推出完成，设置停留刹车。”“启动 2 号发动机。”N2 上升，随后是燃油流量和点火。启动正常。“启动 1 号发动机。”'
          },
          2: {
            title: '推出完成',
            content: '拖车将我们推到滑行道上。“许可启动。”发动机啸叫着苏醒。“拖杆已断开，左侧手势信号。”我们依靠自己的动力了。'
          }
        },
        rainy: {
            0: {
                title: '湿滑推出',
                content: '推出时雨水划过挡风玻璃。停机坪在灯光下闪闪发光。“发动机启动许可。”喷气流在我们身后卷起水雾。'
            }
        },
        shakespearean: {
            0: {
                title: '我们后退',
                content: '我们后退是为了前进！野兽苏醒，呼吸着火焰和烟雾。解开我们的束缚！'
            }
        }
      },
      taxiing: {
        default: {
          0: {
            title: '滑行至跑道 ${departureRunway}',
            content: '“${callsign}，经由 Alpha, Bravo 滑行至跑道 ${departureRunway}。”你松开停留刹车。当你穿过迷宫般的滑行道时，轮胎有节奏地敲击着混凝土接缝。阳光在停机坪上闪烁。'
          },
          1: {
            title: '滑行指令',
            content: '“在 27L 跑道外等待。”我们滑过重型喷气式飞机。“给右边的 747 让路。”前往等待点。起飞襟翼已设置。'
          },
          2: {
            title: '移动中',
            content: '滑行至使用跑道。执行飞行控制检查。“客舱乘务员，准备起飞。”长长的飞机队伍等待起飞。'
          }
        },
        sunny: {
            0: {
                title: '阳光滑行',
                content: '滑行时阳光刺眼。热浪在跑道上闪烁。“滑行至等待点。”准备飞行。'
            }
        },
        rainy: {
            0: {
                title: '湿滑滑行',
                content: '雨刷开启。滑行道灯光在水坑中反射。“注意，报告刹车效应中等。”我们小心地滑行至跑道。'
            }
        },
        shakespearean: {
            0: {
                title: '行军开始',
                content: '我们向命运进军！道路曲折，但目的地明确。前往跑道！'
            }
        }
      },
      takeoff_prep: {
        default: {
          0: {
            title: '对正并等待',
            content: '在跑道 ${departureRunway} 上对正。刹车设置。发动机慢车。“塔台，${callsign} 在跑道 ${departureRunway} 等待，准备起飞。”检查襟翼、配平并核实起飞数据。'
          },
          1: {
            title: '等待位置',
            content: '等待交通清除。“跑道 ${departureRunway}，进跑道等待。”我们在中心线上对正。跑道在我们面前延伸。'
          },
          2: {
            title: '最后检查',
            content: '起飞前检查单完成。“接近离场。”发动机稳定。“准备好了吗？”机长问道。“准备好了，”你回答。'
          }
        },
        rookie: {
            title: '准备起飞',
            content: '你已在跑道上。向前推油门起飞！达到速度时向后拉杆。'
        },
        shakespearean: {
            0: {
                title: '悬崖边缘',
                content: '我们站在世界的边缘！天空在召唤。我们是飞翔，还是坠落？'
            }
        }
      },
      takeoff: {
        default: {
          0: {
            title: '起飞许可',
            content: '在跑道 ${departureRunway} 上对正。“风向 130，风速 8，跑道 ${departureRunway} 许可起飞。”油门向前。发动机轰鸣，将你推向座椅。在 Vr 抬轮。'
          },
          1: {
            title: '滑跑',
            content: '“起飞推力设置。”80 节。“V1，抬轮。”机头离开地面。我们将大地抛在身后。'
          },
          2: {
            title: '离地',
            content: '全马力。跑道变得模糊。拉起。轮子离开停机坪。“正上升率，收轮。”我们在飞翔。'
          }
        },
        rookie: {
            title: '起飞！',
            content: '全马力！拉起！你在飞翔！'
        },
        rainy: {
            0: {
                title: '雨中起飞',
                content: '轮子卷起水雾。油门向前。我们穿过雨水冲入云层。'
            }
        },
        shakespearean: {
            0: {
                title: '飞升',
                content: '我们反抗重力！大地无法束缚我们。向上，向上，进入天堂！'
            }
        }
      },
      initial_climb: {
        default: {
          0: {
            title: '正上升率',
            content: '大地在脚下远去。“收轮。”穿过低层云层进入阳光中。${departure} 城市在下方缩小成微型网格。速度增加到 250 节。'
          },
          1: {
            title: '爬升离场',
            content: '“联系离场台。”“爬升至 5000。”收襟翼。景色壮观。按航向飞行。'
          },
          2: {
            title: '离场',
            content: '转向切入径向线。“保持 250 节。”机场现在远远落在后面。平稳爬升。'
          }
        },
        rookie: {
            title: '爬升',
            content: '保持爬升！不要太快也不要太慢。'
        },
        sunny: {
            0: {
                title: '阳光爬升',
                content: '穿过雾霾进入灿烂的阳光。下面的世界像一张地图。爬升至巡航高度。'
            }
        },
        rainy: {
            0: {
                title: '多云爬升',
                content: '进入云层。能见度下降。仪表飞行。湍流震动着机翼。'
            }
        },
        shakespearean: {
            0: {
                title: '更高',
                content: '我们在钢铁之翼上翱翔！云层是我们的领地。更高，更高！'
            }
        }
      },
      main_climb: {
        default: {
          0: {
            title: '爬升至巡航',
            content: '通过 10,000 英尺。“加速至巡航速度。”随着我们上升，天空变暗成深蓝色。空气平稳。平稳爬升至 FL350。'
          },
          1: {
            title: '通过 FL180',
            content: '“标准气压。”空气稀薄而寒冷。发动机在这里效率很高。为长途飞行安顿下来。'
          },
          2: {
            title: '高高度',
            content: '接近爬升顶点。地球的曲线清晰可见。“2 点钟方向有交通。”我们在高空航路中。'
          }
        },
        shakespearean: {
            0: {
                title: '顶峰',
                content: '我们伸手摘星！空气稀薄，但我们情绪高昂。向着目的地前进！'
            }
        }
      },
      cruise: {
        default: {
          0: {
            title: '巡航在 FL350',
            content: '平飞在 35,000 英尺。地平线是一条弯曲的雾霾线。“保持马赫 0.78。”发动机发出平稳、令人安心的节奏。乘客们正安顿下来准备前往 ${arrival}。'
          },
          1: {
            title: '平稳飞行',
            content: '自动驾驶已接通。监控系统。燃油流量正常。“咖啡吗？”空乘问道。一段宁静的旅程。'
          },
          2: {
            title: '飞行中途',
            content: '行程过半。检查导航。航路点经过。太阳在地平线上落下，将天空染成橙色和紫色。'
          }
        },
        sunny: {
            0: {
                title: '晴空万里',
                content: '万里无云。几英里下的地面清晰可见。完美的飞行天气。'
            }
        },
        shakespearean: {
            0: {
                title: '航行',
                content: '我们在天空的海洋中航行。风是我们的朋友。和平统治着天堂。'
            }
        }
      },
      descent: {
        default: {
          0: {
            title: '开始下降',
            content: '收油门。随着我们开始下降，机头微微下沉。“下降并保持 10,000 英尺。”目的地 ${arrival} 就在前方。'
          },
          1: {
            title: '正在下降',
            content: '“在 12,000 通过限制。”打开扰流板减速。${arrival} 的城市灯光在远处出现。准备进近。'
          },
          2: {
            title: '进场准备',
            content: '检查进场通播。“高度表拨正。”客舱乘务员准备着陆。穿云下降。'
          }
        },
        rainy: {
            0: {
                title: '雨中下降',
                content: '下降进入阴霾。雨水再次拍打窗户。“预期 ILS 进近。”雷达显示前方有风暴。'
            }
        },
        shakespearean: {
            0: {
                title: '归来',
                content: '我们从王座上降临！大地重新接纳我们。准备回归尘世。'
            }
        }
      },
      approach: {
        default: {
          0: {
            title: '进近 ${arrival}',
            content: '对正跑道 ${landingRunway}。“放下起落架，襟翼 30。”跑道入口在雾霾中隐约可见。速度检查，航向道截获。'
          },
          1: {
            title: '五边进近',
            content: '“许可着陆。”三盏绿灯。检查单完成。专注于接地区。1000 英尺。'
          },
          2: {
            title: '短五边',
            content: '500 英尺。进近稳定。“着陆检查。”跑道灯光常亮。快到了。'
          }
        },
        rainy: {
            0: {
                title: '风暴进近',
                content: '对抗侧风。雨刷高速档。跑道从雾中显现。“决断高度。”继续。'
            }
        },
        shakespearean: {
            0: {
                title: '着陆',
                content: '大地向我们冲来！稳住，稳住。我们将亲吻大地！'
            }
        }
      },
      landing: {
        default: {
          0: {
            title: '接地',
            content: '拉平... 接地。扰流板放出。反推轰鸣。“${callsign}，欢迎来到 ${arrival}。”刹车减速至滑行速度。'
          },
          1: {
            title: '已着陆',
            content: '稳固接地。“减速板放出，反推正常。”减速。“下一个滑行道脱离。”我们做到了。'
          },
          2: {
            title: '到达',
            content: '完美着陆。平稳滑跑。“欢迎来到 ${arrival}。”乘客鼓掌。脱离跑道。'
          }
        },
        rainy: {
            0: {
                title: '湿滑着陆',
                content: '水漂风险。重着陆以破坏水膜。水花四溅。安全减速。'
            }
        },
        shakespearean: {
            0: {
                title: '平安归来',
                content: '我们回来了！旅程结束。荣耀归于飞行员！'
            }
        }
      },
      after_land_taxiing: {
        default: {
          0: {
            title: '滑行至登机口',
            content: '“下一个滑行道左转，联系地面。”飞行结束。滑过其他飞机前往指定登机口。'
          },
          1: {
            title: '泊位',
            content: '恢复着陆后构型。收襟翼，关闭相关灯光。接近航站楼。引导员挥手示意我们进入。'
          },
          2: {
            title: '到达登机口',
            content: '转入登机口。“停止。”设置停留刹车。发动机冷却。欢迎回家。'
          }
        },
        shakespearean: {
            0: {
                title: '终章',
                content: '战车停下了。旅程完成。休息吧，疲惫的旅行者。'
            }
        }
      },
      shutoff: {
        default: {
          0: {
            title: '发动机关车',
            content: '设置停留刹车。切断燃油。发动机旋转减速至静止。APU 关闭。“感谢您的搭乘。”飞行完成。'
          },
          1: {
            title: '讲评',
            content: '完成飞行日志。乘客下机。飞机安静下来。干得好。'
          },
          2: {
            title: '关机',
            content: '所有系统关闭。驾驶舱变暗。最后看一眼飞机。下次见。'
          }
        },
        shakespearean: {
            0: {
                title: '寂静',
                content: '寂静降临。野兽沉睡。全剧终。'
            }
        }
      }
    }
  },
  failures: {
    engine: {
      minor: '发动机 ${engineIndex + 1} 显示异常振动。密切监视。',
      critical: '发动机 ${engineIndex + 1} 失效！需要立即采取行动！',
      resolved: '发动机 ${engineIndex + 1} 恢复正常运行。'
    },
    hydraulic: {
      minor: '主液压压力下降。检查系统。',
      critical: '主液压系统失效！需要手动控制！',
      resolved: '液压压力稳定。系统恢复。'
    },
    electrical: {
      minor: '电气汇流条 ${bus} 经历间歇性断电。',
      critical: '主电气汇流条失效！应急电源接通！',
      resolved: '电气汇流条电源恢复正常水平。'
    },
    fuel: {
      minor: '检测到燃油不平衡。交叉供油自动接通。',
      critical: '检测到燃油泄漏！燃油正在快速流失！',
      resolved: '燃油不平衡已解决。'
    },
    default: {
      minor: '检测到系统 ${type} 故障。',
      critical: '系统 ${type} 严重故障！',
      resolved: '系统 ${type} 已恢复。'
    }
  },
  ui: {
    flight: {
        time_zulu: '时间 (Zulu)',
        fuel: '燃油',
        pax: '乘客',
        distance: '距离',
        altitude: '高度',
        speed: '速度',
        heading: '航向',
        vertical_speed: '垂直速度',
        throttle: '油门',
        flaps: '襟翼',
        gear: '起落架',
        brakes: '刹车',
        parking_brake: '停留刹车',
        spoilers: '扰流板',
        messages: {
            freq_busy: '频率繁忙。请稍候。'
        }
    },
    menu: {
        resume: '继续飞行',
        restart: '重新开始',
        settings: '设置',
        quit: '退出到主菜单',
        language: 'Language / 语言'
    },
    systems: {
        status: '系统状态',
        engines: '发动机',
        electrics: '电气',
        hydraulics: '液压',
        fuel: '燃油',
        apu: 'APU',
        pumps: '泵',
        generators: '发电机',
        batteries: '蓄电池',
        engine_and_systems: '发动机与系统',
        overhead_panel_short: '顶板',
        system_status_alerts: '系统状态 / 警报',
        no_active_alerts: '无活动警报',
        on: '开启',
        off: '关闭',
        auto: '自动',
        avail: '可用',
        fault: '故障',
        low_press: '低压',
        open: '打开',
        valve: '阀门',
        off_bus: '离线',
        discharge: '放电',
        disch: '放电',
        maint: '维护',
        inop: '失效'
    },
    startup: {
        checklist_incomplete: '启动检查单未完成',
        missing_items: '缺失项目: ${items}',
        cant_proceed: '无法进入下一阶段。',
        continue_anyway: '强制继续 (禁用安全保护)',
        continue: '继续'
    },
    checklist: {
        title: '检查单',
        empty: '此检查单中没有项目。',
        completed_suffix: '已完成'
    },
    flight_computer: {
        title: '飞行计算机',
        tabs: {
            plan: '航线',
            add: '添加',
            nearest: '最近',
            perf: '性能'
        },
        empty: {
            no_waypoints: '飞行计划中没有航点。'
        },
        add: {
            manual_entry: '手动输入',
            placeholders: {
                lat: '纬度 (如 37.61)',
                lon: '经度 (如 -122.37)',
                label: '标签 (可选)'
            },
            add_coordinates: '添加坐标',
            or: '或'
        },
        search: {
            title: '机场搜索',
            placeholder: '搜索 ICAO/IATA/名称...',
            options: {
                all: '全部',
                normal: '普通',
                emergency: '应急'
            },
            submit: '搜索'
        },
        nearest: {
            open: '附近备降机场',
            radius: '搜索半径',
            suitability: '按机型跑道要求筛选机场。着陆前请核实条件。',
            map: '附近备降机场地图',
            distance: '距离',
            bearing: '方位',
            left: '左',
            right: '右',
            divert: '直飞备降',

            finding: '正在搜索机场...',
            none: '未找到机场。',
            emergency_tag: '应急',
            add: '添加',
            refresh: '刷新'
        },
        actions: {
            hold: '盘旋',
            holding: '盘旋中',
            toggle_hold_title: '切换等待航线（盘旋）'
        },
        tags: {
            active: '活动'
        },
        radio: {
            nav_title: '导航电台',
            current_nav1: '当前 NAV1 频率',
            set_freq: '设置频率 (MHz)',
            tune: '调谐',
            common_ils: '常见 ILS 频率: 108.10, 108.15, ..., 111.95',
            invalid_freq: '频率无效。必须在 108.00 到 117.95 MHz 之间'
        },
        utils: {
            predictions: '预测',
            next_wp: '下一个航点:',
            distance: '距离:',
            ete_to_wpt: '到航点预计时间:',
            fuel_flow: '燃油流量:',
            time_to_empty: '耗尽时间:',
            target_alt: '目标高度 (英尺):',
            time_to_alt: '到达目标高度时间:',
            converter: {
                title: '单位换算',
                value: '数值',
                result_label: '结果:'
            }
        },
        errors: {
            invalid_coordinates: '请输入有效的坐标'
        }
    },
    cinematic: {
        confidential: '机密',
        manifest_title: '航班清单',
        official_dispatch: '官方签派文件 // ${callsign}',
        date: '日期',
        time: '时间',
        page: '页: ${page}',
        sections: {
            flight_data: '01. 航班数据',
            route_logistics: '02. 航线与保障',
            metar_env: '03. 天气与环境',
            operational_risk: '04. 运行风险'
        },
        labels: {
            operator: '运营方',
            aircraft: '机型',
            origin: '起点',
            destination: '终点',
            pax_crew: '乘员/机组',
            payload: '载重',
            departure_gate: '出发登机口',
            arrival_gate: '到达登机口',
            taxi_out: '滑行道 (出)',
            taxi_in: '滑行道 (入)',
            departure_rwy: '起飞跑道',
            landing_rwy: '降落跑道',
            sid: 'SID',
            star: 'STAR',
            waypoints: '航点:',
            wind: '风速',
            visibility: '能见度',
            turbulence: '颠簸',
            cloud_cover: '云量',
            difficulty: '难度',
            failure_mode: '故障模式'
        },
        units: { knots: '节', km: '公里' },
        turbulence: { none: '无', light: '轻度', moderate: '中度', severe: '严重', extreme: '极端', unavailable: '暂无数据' },
        failure_modes: { normal: '正常模拟', custom: '自定义故障', none: '无', random: '随机', fixed: '固定' },
        weather_sources: {
            live: '起飞机场实时天气；能见度和颠簸为估算值。',
            simulated: '起飞机场模拟天气（离线模式）。',
            fallback: '起飞机场模拟天气（实时天气暂不可用）。',
            configured: '场景预设天气。',
            unavailable: '起飞机场天气暂无数据。'
        },
        buttons: {
            acknowledge: '确认签派'
        }
    },
    narrative_ui: {
        designation: '代号:',
        background: '背景:',
        mission: '任务:',
        intelligence: '情报:',
        accept_assignment: '接受任务'
    },
    crash: {
        crashed: '已坠毁',
        final_score: '最终得分: ${score}',
        failed_control: '未能保持对飞机的控制',
        try_again: '重试'
    },
    comm: {
        active_comm: '当前通信',
        no_signal: '无信号',
        searching: '搜索中...',
        tabs: {
            log: '日志',
            signals: '信号'
        },
        no_signals: '未检测到信号',
        radio_silent: '无线电静默',
        connected: '已连接'
    }
  },
  initialization: {
    title: '空中豪截 - 航班初始化',
    subtitle: '配置您的飞行参数并选择难度等级',
    steps: {
      1: '01. 操作等级与情报',
      2: '02. 飞行参数',
      3: '03. 航线选择'
    },
    failures: {
      profiles: {
        rookie: '仅简单故障，同时最多一个；无随机连锁故障。部分故障库没有适合新手的故障。难度限制可能减少实际故障数。',
        amateur: '可控故障，同时最多一个；有限连锁反应。',
        intermediate: '较严重故障，同时最多两个；标准连锁反应。',
        advanced: '复杂紧急情况，同时最多三个；连锁反应更快。',
        pro: '可能出现灾难性故障，同时最多四个；较强连锁反应。',
        devil: '优先触发系统故障链；同时最多五个随机故障，另可产生更快、更强的跨系统连锁故障。',
      },

      edit: '修改难度',
      title: '故障概率', normal: '正常模拟', custom: '不太正常',
      count: '每航班故障数', banks: '故障库', engine: '发动机', systems: '机载系统',
      controls: '飞行操纵', environment: '环境', sensors: '传感器',
      normal_hint: '不随机触发故障。机组难度仍然生效。',
      custom_hint: '按预计飞行时间随机触发约定数量的故障。连锁反应可能增加故障；所选故障库仅限制随机触发。',
      empty: '请至少选择一个故障库后继续。'
    },
    difficulty: {
      rookie: '菜鸟',
      amateur: '业余',
      intermediate: '中级',
      advanced: '高级',
      pro: '职业',
      devil: '魔鬼'
    },
    intel: {
      label: '机组情报:',
      descriptions: {
        rookie: '高度支持。NPC 协助所有检查。严格遵守标准程序。',
        amateur: '经验丰富的机组。在重大事件中提供可靠支持。NPC 会提供协助。',
        intermediate: '标准操作。机组听从指挥并精确执行命令。',
        advanced: '能力尚可，但在高压条件下容易犹豫或犯小错误。',
        pro: '高压力。机组表现紧张，在紧急情况下容易犯重大错误。',
        devil: '独立优先。可能会主动偏离程序。不要依赖协助。'
      }
    },
    params: {
      airline: '航空公司',
      callsign: '呼号',
      aircraft_type: '机型',
      crew_count: '机组人数',
      passengers: '乘客 (PAX)',
      payload: '载重 (KG)',
      cruise_height: '巡航高度 (FT)',
      reserve_fuel: '备用燃油 (小时)',
      zulu_time: '祖鲁时间',
      season: '季节',
      seasons: {
        Spring: '春季',
        Summer: '夏季',
        Autumn: '秋季',
        Winter: '冬季'
      },
      random: '随机'
    },
    route: {
      departure: '起飞机场',
      arrival: '到达机场',
      search_placeholder: '搜索 ICAO/IATA...',
      clear_selection: '清除选择',
      results_count: '找到 ${count} 个机场',
      summary: {
        route: '航线:',
        distance: '距离:',
        est_time: '预计时间:',
        fuel_req: '燃油需求:',
        trip: '航程',
        rsv: '备用',
        total: '总计'
      }
    },
    buttons: {
      next_params: '下一步: 飞行参数 →',
      next_route: '下一步: 航线选择 →',
      finalize: '完成签派并初始化',
      randomize_difficulty: '随机化难度',
      randomize_parameters: '随机化参数',
      randomize_route: '随机化航线'
    }
  }
};

export default zh;
