from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
import os

app = Flask(__name__)

# Configure the PostgreSQL database connection
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:Admin%21006@localhost:5432/Strefa'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Define the database models
class MapIcon(db.Model):
    __tablename__ = 'map_icon'  # Ensure the table name matches 'map_icon'
    id = db.Column(db.Integer, primary_key=True)
    x_position = db.Column(db.Float, nullable=False)
    y_position = db.Column(db.Float, nullable=False)
    icon_type = db.Column(db.String(50))
    icon_color = db.Column(db.String(7))  # Store the color as a hex code
    name = db.Column(db.String(100))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    faction_id = db.Column(db.Integer, db.ForeignKey('faction.id'), nullable=True)  # Foreign key to faction
    faction = db.relationship('Faction', backref='icons')  # Relationship to Faction

class Connection(db.Model):
    __tablename__ = 'connection'  # Ensure the table name matches 'connection'
    id = db.Column(db.Integer, primary_key=True)
    icon_from_id = db.Column(db.Integer, db.ForeignKey('map_icon.id'), nullable=False)
    icon_to_id = db.Column(db.Integer, db.ForeignKey('map_icon.id'), nullable=False)

class Faction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)  # Faction name
    description = db.Column(db.String(200), nullable=True)  # Optional description

# Create the tables if they don't exist
with app.app_context():
    db.create_all()

# Route to render the HTML template with the map
@app.route('/')
def index():
    print(app.url_map)
    return render_template('index.html')

# API endpoint to handle icon submission (create new icon)
@app.route('/add_icon', methods=['POST'])
def add_icon():
    data = request.get_json()
    faction_id = data.get('faction_id')  # Get the faction ID from the request
    
    new_icon = MapIcon(
        x_position=data['x_position'],
        y_position=data['y_position'],
        icon_type=data['icon_type'],
        icon_color=data['icon_color'],
        name=data['name'],
        description=data['description'],
        faction_id=faction_id  # Save the faction ID
    )
    db.session.add(new_icon)
    db.session.commit()
    return jsonify({'success': True, 'id': new_icon.id})

# API endpoint to get all icons
@app.route('/get_icons', methods=['GET'])
def get_icons():
    icons = MapIcon.query.all()  # Assuming you have a MapIcon model

    icons_data = []
    for icon in icons:
        faction_name = icon.faction.name if icon.faction else "No faction"  # Fetch faction name
        icon_data = {
            'id': icon.id,
            'icon_type': icon.icon_type,
            'icon_color': icon.icon_color,
            'name': icon.name,
            'description': icon.description,
            'x_position': icon.x_position,
            'y_position': icon.y_position,
            'faction_name': faction_name,  # Include faction name
        }
        icons_data.append(icon_data)

    return jsonify(icons_data)



# API endpoint to get a specific icon by ID
@app.route('/get_icon/<int:icon_id>', methods=['GET'])
def get_icon(icon_id):
    icon = MapIcon.query.get(icon_id)
    if icon:
        icon_data = {
            'id': icon.id,
            'x_position': icon.x_position,
            'y_position': icon.y_position,
            'icon_type': icon.icon_type,
            'icon_color': icon.icon_color,
            'name': icon.name,
            'description': icon.description
        }
        return jsonify(icon_data)
    else:
        return jsonify({'success': False, 'error': 'Icon not found'}), 404


# API endpoint to handle adding a connection between icons
@app.route('/add_connection', methods=['POST'])
def add_connection():
    try:
        # Ensure the request data is JSON
        data = request.get_json()

        # Extract the icon_from_id and icon_to_id from the request data
        icon_from_id = data.get('icon_from_id')
        icon_to_id = data.get('icon_to_id')

        if not icon_from_id or not icon_to_id:
            return jsonify({"error": "Both icon_from_id and icon_to_id are required"}), 400

        # Check that icon_from_id and icon_to_id are not the same
        if icon_from_id == icon_to_id:
            return jsonify({"error": "Cannot connect an icon to itself"}), 400

        # Create a new connection entry (assuming Connection is the model handling connections)
        new_connection = Connection(
            icon_from_id=icon_from_id,
            icon_to_id=icon_to_id
        )

        # Add the connection to the database
        db.session.add(new_connection)
        db.session.commit()

        # Return success response
        return jsonify({"success": True, "connection": {"from": icon_from_id, "to": icon_to_id}}), 201

    except Exception as e:
        # Handle errors
        return jsonify({"error": str(e)}), 500

# API endpoint to get all connections
@app.route('/get_connections', methods=['GET'])
def get_connections():
    try:
        connections = Connection.query.all()
        connections_data = [
            {"icon_from_id": connection.icon_from_id, "icon_to_id": connection.icon_to_id}
            for connection in connections
        ]
        return jsonify(connections_data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# API endpoint to get connections for a specific icon
@app.route('/get_connections_for_icon/<int:icon_id>', methods=['GET'])
def get_connections_for_icon(icon_id):
    connections = Connection.query.filter_by(icon_from_id=icon_id).all()
    connected_ids = [conn.icon_to_id for conn in connections]
    return jsonify(connected_ids)

# API endpoint to delete an icon and its connections
@app.route('/delete_icon/<int:icon_id>', methods=['DELETE'])
def delete_icon(icon_id):
    icon = MapIcon.query.get(icon_id)
    if icon:
        # Delete all connections where this icon is involved
        Connection.query.filter((Connection.icon_from_id == icon_id) | (Connection.icon_to_id == icon_id)).delete()
        db.session.delete(icon)
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Icon not found'}), 404

# API endpoint to update an icon's details and its connections
@app.route('/update_icon/<int:icon_id>', methods=['POST'])
def update_icon(icon_id):
    try:
        data = request.get_json()  # Get the JSON data from the request

        # Find the icon in the database by its ID
        icon = MapIcon.query.get(icon_id)

        if not icon:
            return jsonify({"error": "Icon not found"}), 404

        # Update the icon fields from the request data
        icon.icon_type = data.get('icon_type', icon.icon_type)
        icon.icon_color = data.get('icon_color', icon.icon_color)
        icon.name = data.get('name', icon.name)
        icon.description = data.get('description', icon.description)
        
        # Update the faction_id if provided
        icon.faction_id = data.get('faction_id', icon.faction_id)

        # Save the changes to the database
        db.session.commit()

        return jsonify({"success": True}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/delete_connection', methods=['POST'])
def delete_connection():
    try:
        # Get the JSON data from the request
        data = request.get_json()

        # Extract the 'from_id' and 'to_id' from the data
        from_id = data.get('from_id')
        to_id = data.get('to_id')

        if not from_id or not to_id:
            return jsonify({"error": "Both from_id and to_id are required"}), 400

        # Find and delete the connection in the database
        connection = Connection.query.filter_by(icon_from_id=from_id, icon_to_id=to_id).first()

        if connection:
            db.session.delete(connection)
            db.session.commit()
            return jsonify({"success": True}), 200
        else:
            return jsonify({"error": "Connection not found"}), 404

    except Exception as e:
        # Handle errors
        return jsonify({"error": str(e)}), 500

@app.route('/get_factions', methods=['GET'])
def get_factions():
    factions = Faction.query.all()
    faction_list = [{'id': f.id, 'name': f.name} for f in factions]
    return jsonify(faction_list)

@app.route('/get_faction_name/<int:faction_id>', methods=['GET'])
def get_faction_name(faction_id):
    faction = Faction.query.get(faction_id)
    if faction:
        print(f"Fetched faction name: {faction.name} for faction_id: {faction_id}")  # Add logging
        return jsonify({"name": faction.name})
    else:
        return jsonify({"name": "No faction"}), 404

@app.route('/get_faction_relations', methods=['GET'])
def get_faction_relations():
    factions = Faction.query.all()  # Assuming you have a Faction model
    relations = FactionRelation.query.all()  # Assuming you have a FactionRelation model

    faction_data = []
    for faction in factions:
        relation_row = {}
        relation_row['faction_name'] = faction.name
        relation_row['relations'] = {}

        # Get the relationships for this faction
        for relation in relations:
            if relation.faction_id_1 == faction.id:
                other_faction = Faction.query.get(relation.faction_id_2)
                relation_row['relations'][other_faction.name] = relation.relation

        faction_data.append(relation_row)

    return jsonify(faction_data)

if __name__ == '__main__':
    app.run(debug=True)
