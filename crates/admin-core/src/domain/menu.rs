#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MenuNode {
    pub id: i64,
    pub name: String,
    pub menu_type: i32,
    pub url: Option<String>,
    pub icon: Option<String>,
    pub sort: i32,
    pub parent_id: Option<i64>,
    pub children: Vec<MenuNode>,
}

impl MenuNode {
    pub fn root(id: i64, name: impl Into<String>, url: impl Into<String>, sort: i32) -> Self {
        Self {
            id,
            name: name.into(),
            menu_type: 1,
            url: Some(url.into()),
            icon: None,
            sort,
            parent_id: None,
            children: Vec::new(),
        }
    }

    pub fn child(
        id: i64,
        name: impl Into<String>,
        url: impl Into<String>,
        sort: i32,
        parent_id: i64,
    ) -> Self {
        Self {
            id,
            name: name.into(),
            menu_type: 2,
            url: Some(url.into()),
            icon: None,
            sort,
            parent_id: Some(parent_id),
            children: Vec::new(),
        }
    }

    pub fn with_children(mut self, children: impl IntoIterator<Item = MenuNode>) -> Self {
        self.children = children.into_iter().collect();
        self
    }
}
