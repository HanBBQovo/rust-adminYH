use serde::{Deserialize, Serialize};

use crate::domain::MenuNode;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LegacyMenuNode {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub menu_type: i32,
    pub url: Option<String>,
    pub icon: Option<String>,
    pub sort: i32,
    #[serde(rename = "parentId", skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<i64>,
    #[serde(rename = "partentId", skip_serializing_if = "Option::is_none")]
    pub legacy_parent_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<LegacyMenuNode>,
    #[serde(rename = "chilren", default, skip_serializing_if = "Vec::is_empty")]
    pub legacy_children: Vec<LegacyMenuNode>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct MenuMutationRequest {
    pub name: String,
    #[serde(rename = "type", default)]
    pub menu_type: Option<i32>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub sort: Option<i32>,
    #[serde(rename = "parentId", default)]
    pub parent_id: Option<i64>,
    #[serde(rename = "partentId", default)]
    pub legacy_parent_id: Option<i64>,
    #[serde(default)]
    pub children: Vec<MenuMutationRequest>,
    #[serde(rename = "chilren", default)]
    pub legacy_children: Vec<MenuMutationRequest>,
}

impl LegacyMenuNode {
    pub fn from_role_menu(value: MenuNode) -> Self {
        Self {
            id: value.id,
            name: value.name,
            menu_type: value.menu_type,
            url: value.url,
            icon: value.icon,
            sort: value.sort,
            parent_id: value.parent_id,
            legacy_parent_id: value.parent_id,
            children: value
                .children
                .into_iter()
                .map(Self::from_role_menu)
                .collect(),
            legacy_children: Vec::new(),
        }
    }

    pub fn from_menu_tree(value: MenuNode) -> Self {
        let legacy_children = value
            .children
            .into_iter()
            .map(Self::from_menu_tree)
            .collect::<Vec<_>>();
        Self {
            id: value.id,
            name: value.name,
            menu_type: value.menu_type,
            url: value.url,
            icon: value.icon,
            sort: value.sort,
            parent_id: value.parent_id,
            legacy_parent_id: None,
            children: Vec::new(),
            legacy_children,
        }
    }

    pub fn from_full_menu_tree(value: MenuNode) -> Self {
        let legacy_children = value
            .children
            .into_iter()
            .map(Self::from_full_menu_tree)
            .collect::<Vec<_>>();
        Self {
            id: value.id,
            name: value.name,
            menu_type: value.menu_type,
            url: value.url,
            icon: value.icon,
            sort: value.sort,
            parent_id: value.parent_id,
            legacy_parent_id: value.parent_id,
            children: Vec::new(),
            legacy_children,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct RoleMenuIdsResponse {
    pub id: i64,
    pub name: String,
    pub intro: String,
    #[serde(rename = "menuIds")]
    pub menu_ids: Vec<i64>,
}
